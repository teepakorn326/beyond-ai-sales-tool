#!/usr/bin/env bash
# Remove everything infra/aws/bootstrap.sh created. Destroys the database and
# every stored document image; there is no snapshot.
#   AWS_REGION=ap-southeast-2 infra/aws/teardown.sh
set -euo pipefail
REGION="${AWS_REGION:-ap-southeast-2}"
NAME="${VDC_NAME:-vdc-demo}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="${NAME}-documents-${ACCOUNT}"

read -r -p "Delete RDS ${NAME}-pg and bucket ${BUCKET} in ${REGION}? Type the name to confirm: " answer
[ "$answer" = "$NAME" ] || { echo "aborted"; exit 1; }

if aws rds describe-db-instances --db-instance-identifier "${NAME}-pg" --region "$REGION" >/dev/null 2>&1; then
  aws rds delete-db-instance --db-instance-identifier "${NAME}-pg" --skip-final-snapshot --region "$REGION" >/dev/null
  echo "deleting RDS instance (a few minutes)..."
  aws rds wait db-instance-deleted --db-instance-identifier "${NAME}-pg" --region "$REGION"
fi
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3 rm "s3://$BUCKET" --recursive --region "$REGION" >/dev/null
  aws s3api delete-bucket --bucket "$BUCKET" --region "$REGION"
  echo "bucket deleted"
fi
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${NAME}-db" \
     --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")
[ "$SG" = "None" ] || aws ec2 delete-security-group --group-id "$SG" --region "$REGION"
echo "done"
