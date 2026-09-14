#!/usr/bin/env bash
# Provision the AWS side of the demo in one region and print the .env values.
#
#   AWS_REGION=ap-southeast-2 VDC_DB_PASSWORD='...' infra/aws/bootstrap.sh
#
# Creates (idempotently):
#   - a private S3 bucket for document images (Block Public Access, SSE, TLS-only)
#   - a security group that allows 5432 only from this machine's public IP
#   - an RDS PostgreSQL 16 instance (db.t4g.micro, 20 GB gp3, publicly reachable
#     for the demo only) and applies db/schema.sql to it
#   - a check that Bedrock model access is enabled for Claude and Cohere
#
# Needs: aws CLI v2 with credentials allowed to create these resources, docker
# (for psql; the host does not need it installed), curl.
# Model access itself is a console step; the script tells you if it is missing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGION="${AWS_REGION:-ap-southeast-2}"
NAME="${VDC_NAME:-vdc-demo}"
DB_PASSWORD="${VDC_DB_PASSWORD:-}"
DB_USER="app"
DB_NAME="app"
DB_CLASS="${VDC_DB_CLASS:-db.t4g.micro}"
EMBED_MODEL="${EMBEDDING_MODEL:-cohere.embed-multilingual-v3}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need aws; need docker; need curl
[ -n "$DB_PASSWORD" ] || { echo "set VDC_DB_PASSWORD (RDS master password, 16+ chars, no @ / \" or spaces)" >&2; exit 1; }

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="${NAME}-documents-${ACCOUNT}"
bold "== account $ACCOUNT · region $REGION · name $NAME"

# ---------------------------------------------------------------- S3
bold "== S3 bucket $BUCKET"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<JSON
{"Version":"2012-10-17","Statement":[{"Sid":"DenyInsecureTransport","Effect":"Deny","Principal":"*",
 "Action":"s3:*","Resource":["arn:aws:s3:::$BUCKET","arn:aws:s3:::$BUCKET/*"],
 "Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}
JSON
)"
echo "bucket ready (public access blocked, SSE on, TLS only)"

# ---------------------------------------------------------------- security group
bold "== security group ${NAME}-db"
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text --region "$REGION")
[ "$VPC" != "None" ] || { echo "no default VPC in $REGION; create one or set up networking by hand" >&2; exit 1; }
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${NAME}-db" "Name=vpc-id,Values=$VPC" \
     --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")
if [ "$SG" = "None" ]; then
  SG=$(aws ec2 create-security-group --group-name "${NAME}-db" --description "vdc demo postgres" \
       --vpc-id "$VPC" --query GroupId --output text --region "$REGION")
fi
MYIP=$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')
aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 5432 --cidr "$MYIP/32" \
  --region "$REGION" >/dev/null 2>&1 || true   # already present is fine
echo "sg $SG allows 5432 from $MYIP/32"

# ---------------------------------------------------------------- RDS
bold "== RDS ${NAME}-pg (PostgreSQL 16, $DB_CLASS)"
if ! aws rds describe-db-instances --db-instance-identifier "${NAME}-pg" --region "$REGION" >/dev/null 2>&1; then
  aws rds create-db-instance --db-instance-identifier "${NAME}-pg" --engine postgres --engine-version 16 \
    --db-instance-class "$DB_CLASS" --allocated-storage 20 --storage-type gp3 \
    --master-username "$DB_USER" --master-user-password "$DB_PASSWORD" --db-name "$DB_NAME" \
    --vpc-security-group-ids "$SG" --publicly-accessible --backup-retention-period 0 \
    --no-multi-az --region "$REGION" >/dev/null
fi
echo "waiting for the instance to be available (first time takes ~10 minutes)"
aws rds wait db-instance-available --db-instance-identifier "${NAME}-pg" --region "$REGION"
ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier "${NAME}-pg" --region "$REGION" \
           --query 'DBInstances[0].Endpoint.Address' --output text)
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${ENDPOINT}:5432/${DB_NAME}?sslmode=require"
echo "endpoint $ENDPOINT"

bold "== applying db/schema.sql"
docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q < "$ROOT/db/schema.sql"
echo "schema applied"

# ---------------------------------------------------------------- Bedrock
bold "== Bedrock model access in $REGION"
pick_profile() {  # first inference profile that answers a one-token probe, preferring Australia-only (au.) over APAC
  local family="$1"
  for prefix in au. apac.; do
    for id in $(aws bedrock list-inference-profiles --region "$REGION" --query "inferenceProfileSummaries[?starts_with(inferenceProfileId, '${prefix}anthropic.claude-${family}')].inferenceProfileId" --output text 2>/dev/null | tr '\t' '\n' | sort -r); do
      if probe_claude "$id"; then echo "$id"; return 0; fi
    done
  done
  return 1
}
probe_claude() {
  aws bedrock-runtime invoke-model --region "$REGION" --model-id "$1" --content-type application/json \
    --body "$(printf '{"anthropic_version":"bedrock-2023-05-31","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' | base64)" \
    /dev/null >/dev/null 2>&1
}
SONNET="${ANTHROPIC_MODEL:-$(pick_profile sonnet || true)}"
HAIKU="${ANTHROPIC_CLASSIFY_MODEL:-$(pick_profile haiku || true)}"
probe_cohere() {
  aws bedrock-runtime invoke-model --region "$REGION" --model-id "$EMBED_MODEL" --content-type application/json \
    --body "$(printf '{"texts":["hi"],"input_type":"search_query"}' | base64)" /dev/null >/dev/null 2>&1
}
status=0
for pair in "Claude Sonnet|$SONNET|probe_claude $SONNET" "Claude Haiku|$HAIKU|probe_claude $HAIKU" "Cohere embed|$EMBED_MODEL|probe_cohere"; do
  label="${pair%%|*}"; rest="${pair#*|}"; id="${rest%%|*}"; cmd="${rest#*|}"
  if [ -z "$id" ]; then echo "  $label: no au./apac. inference profile answered in $REGION (newest models can be gated per account; Sonnet 4.6 or 4.5 usually works)"; status=1
  elif $cmd; then echo "  $label: enabled ($id)"
  else echo "  $label: NOT enabled or not accessible ($id)"; status=1; fi
done
if [ $status -ne 0 ]; then
  echo "Models enable on first invoke. If Claude is gated, open Bedrock > Playground, pick the model and send one message to trigger the use-case form, then re-run."
fi

# ---------------------------------------------------------------- output
bold "== add to .env"
cat <<ENV
AWS_REGION=$REGION
AI_PROVIDER=bedrock
ANTHROPIC_MODEL=$SONNET
ANTHROPIC_CLASSIFY_MODEL=$HAIKU
AGENT_MODEL=$SONNET
EMBEDDING_PROVIDER=bedrock
EMBEDDING_MODEL=$EMBED_MODEL
EMBEDDING_DIMS=1024
S3_BUCKET=$BUCKET
DATABASE_URL=$DATABASE_URL
ENV
echo "# plus AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY for an IAM user with infra/aws/iam-policy.json"
echo "# (replace BUCKET_NAME=$BUCKET, REGION=$REGION, ACCOUNT_ID=$ACCOUNT in that file)"
