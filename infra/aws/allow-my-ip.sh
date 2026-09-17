#!/usr/bin/env bash
# Let a machine reach the demo RDS instance. bootstrap.sh limits port 5432
# to the IP the owner had at the time; anyone else, or the owner on another
# network, gets a connection timeout from ./run.sh demo.
#
#   infra/aws/allow-my-ip.sh            # this machine's public IP
#   infra/aws/allow-my-ip.sh 1.2.3.4    # a teammate's IP, added by the owner
#
# Credentials: the AWS CLI's own (owner) or, with no CLI configured, the
# runtime key in .env, whose IAM policy allows exactly this one change to
# this one security group. Without the CLI installed it runs amazon/aws-cli
# in Docker. Allow ~15 seconds for the rule to take effect.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
NAME="${NAME:-vdc-demo}"
REGION="${AWS_REGION:-ap-southeast-2}"
IP="${1:-$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')}"

if command -v aws >/dev/null 2>&1; then
  awscli() { aws "$@"; }
else
  command -v docker >/dev/null 2>&1 || { echo "needs the aws CLI or docker" >&2; exit 1; }
  awscli() { docker run --rm --env-file <(grep -E '^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)=' .env 2>/dev/null || true) amazon/aws-cli "$@"; }
fi
# No CLI identity of its own? Fall back to the runtime key from .env.
if ! awscli sts get-caller-identity >/dev/null 2>&1 && [ -f .env ]; then
  set -a; . ./.env; set +a
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
fi
export AWS_DEFAULT_REGION="$REGION"

SG=$(awscli rds describe-db-instances --db-instance-identifier "${NAME}-pg" --region "$REGION" \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)
if awscli ec2 describe-security-groups --group-ids "$SG" --region "$REGION" \
     --query "SecurityGroups[0].IpPermissions[?FromPort==\`5432\`].IpRanges[].CidrIp" --output text | tr '\t' '\n' | grep -qx "$IP/32"; then
  echo "sg $SG already allows 5432 from $IP/32"
else
  awscli ec2 authorize-security-group-ingress --group-id "$SG" --region "$REGION" --protocol tcp --port 5432 --cidr "$IP/32" >/dev/null
  echo "sg $SG now allows 5432 from $IP/32 (takes effect within ~15s)"
fi
