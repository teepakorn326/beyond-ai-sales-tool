#!/usr/bin/env bash
# Let the machine you are on reach the demo RDS instance. bootstrap.sh
# limits port 5432 to the public IP you had at the time; on a different
# network the schema step times out. Run this once per new network.
#   infra/aws/allow-my-ip.sh
set -euo pipefail
NAME="${NAME:-vdc-demo}"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-southeast-2}"
SG=$(aws rds describe-db-instances --db-instance-identifier "${NAME}-pg" \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)
MYIP=$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')
if aws ec2 describe-security-groups --group-ids "$SG" \
     --query "SecurityGroups[0].IpPermissions[?FromPort==\`5432\`].IpRanges[].CidrIp" --output text | tr '\t' '\n' | grep -qx "$MYIP/32"; then
  echo "sg $SG already allows 5432 from $MYIP/32"
else
  aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 5432 --cidr "$MYIP/32" >/dev/null
  echo "sg $SG now allows 5432 from $MYIP/32"
fi
