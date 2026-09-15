# Deployment

Three services on Fly.io, region `syd`. Deploys are gated on the test suite, so
a prompt change that regresses extraction accuracy cannot reach production.

```
internet ──▶ vdc-web (Next.js, :3000, public)
                 │  Fly private network, IPv6 only
                 ▼
             vdc-extractor (FastAPI, :8000, private)
                 │
                 ▼
             vdc-rules (Go, :8081, private)
```

Only the web tier has a public address. The extractor and the rules engine are
reachable exclusively over Fly's private network via `.internal` DNS, so there
is no public endpoint that accepts a document or returns a case file.

## Why Sydney

`primary_region = "syd"` is a compliance decision, not a latency one.

The business has Australian entities and processes academic records belonging
largely to Thai minors. Keeping inference and storage in-region is the answer
that survives being asked by a parent, by a partner institution, or by a
privacy review — and it is a materially different answer from "somewhere in
us-east". Running against Bedrock in `ap-southeast-2` rather than the direct
API is a one-line client change and keeps the same property.

If in-region inference is required end to end, note that Bedrock's *Global*
cross-region inference profile routes compute across many regions. Use an
in-region or APAC profile instead, and accept the lower quota.

## Data and AI on AWS (the demo)

The application services run anywhere (Docker Compose locally, or Fly as
below); the data and the models live in `ap-southeast-2`:

| piece | service | why |
|---|---|---|
| records + vector index | RDS PostgreSQL 16 with `pgvector` | one database for rows and embeddings; `db/schema.sql` is idempotent |
| document images | private S3 bucket, Block Public Access, SSE, TLS-only policy | opaque keys, no presigned URLs: the app streams pages itself |
| Claude | Bedrock, APAC inference profiles | same SDK (`AnthropicBedrock`), IAM instead of API keys, in-region |
| embeddings | Bedrock `cohere.embed-multilingual-v3` | Thai questions from sales staff; 1024 dimensions |

```bash
VDC_DB_PASSWORD='...' infra/aws/bootstrap.sh   # bucket, security group, RDS, schema, Bedrock access check
# paste its output into .env, then:
./run.sh demo                                   # migrate, compose up, seed policies, import web/.data
infra/aws/allow-my-ip.sh                        # on a new network: let this machine reach RDS again
infra/aws/teardown.sh                           # delete everything (no snapshot)
```

Bedrock model access is a console step the script cannot perform: enable
Claude Sonnet, Claude Haiku and Cohere Embed Multilingual v3 in the region
before running the demo. Use the APAC inference profile ids the script
prints, not the Global profile (see "Why Sydney"). The IAM user for the
containers gets `infra/aws/iam-policy.json` only: the bucket, the three
models, nothing else. RDS uses password auth over TLS: `infra/aws/rds-global-bundle.pem`
is the public RDS CA bundle, `PG_CA_CERT_PATH` points the web tier at it so the
server certificate is verified (node-postgres treats `sslmode=require` as
verify-full, so the mode is stripped from the URL and TLS configured explicitly
in `web/app/lib/db.ts`), and the agent container gets it as `PGSSLROOTCERT`.
The `au.` inference profiles route between Sydney and Melbourne, which is why
the IAM policy allows the Anthropic foundation models in every region.

Standing cost while the demo exists is the `db.t4g.micro` instance and the
bucket; Bedrock and S3 requests are per use. `teardown.sh` removes the
standing cost. The extractor's daily token budget also counts embedding
tokens.

## First-time setup

```bash
fly auth login

# rules first: the extractor's readiness probe depends on it
cd rules      && fly launch --no-deploy --copy-config && fly deploy
cd ../extractor && fly launch --no-deploy --copy-config
fly volumes create vdc_data --region syd --size 1   # daily budget counter
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy

cd ../web && fly launch --no-deploy --copy-config && fly deploy
```

Secrets live in `fly secrets`, never in `fly.toml` and never in the repository.
`.env` is git-ignored; `.env.example` carries the key names only.

For CI, create a scoped deploy token and store it as the `FLY_API_TOKEN` repo
secret:

```bash
fly tokens create deploy -x 8760h
```

## Cost control on a public demo

A portfolio deployment is a URL a stranger can hit in a loop. Two guards, both
in `extractor/app/guards.py`:

**Daily token budget** — `DAILY_TOKEN_BUDGET` caps spend per day, persisted to
a volume so a restart does not reset the counter. Past the cap, extraction
returns `429` with an explanation. Deliberately a spend cap rather than a
request rate limit: one forty-page PDF costs more than a hundred passport
pages, so requests are the wrong unit.

The `/check` endpoint is exempt. Consistency checking calls no model, costs
nothing, and must keep working after the cap is reached.

**Demo mode** — `DEMO_MODE=true` accepts only files from the synthetic corpus.
This is not a technical limitation. A public URL that accepts passports and
transcripts is a data-protection liability, and the honest way to demonstrate a
system built for minors' documents is on documents nobody owns.

**Idle shutdown** — the extractor and rules engine scale to zero
(`min_machines_running = 0`) and wake on demand. The web tier keeps one machine
warm so that a recruiter clicking the demo link does not meet a cold start.
Steady-state cost is a few dollars a month.

## Health checks

| endpoint | service | semantics |
|---|---|---|
| `/healthz` | rules, extractor | liveness — answers even when dependencies are down |
| `/readyz` | extractor | readiness — **fails** if the rules engine is unreachable |
| `/api/healthz` | web | liveness, reports upstream status without failing on it |

`/readyz` failing on an unreachable rules engine is the important one. An
extractor that cannot reach the rules engine would otherwise happily extract
documents and then silently never check them, which is worse than being down:
the case would look processed.

The web tier takes the opposite stance and stays up while reporting the
problem, because a visitor is better served by a page that says what is broken
than by a blank platform error.

## Observability

Every extraction emits one structured JSON line: prompt version, model, page
count, latency, input and output tokens, unreadable field count, low-confidence
field count. No document content and no extracted values are ever logged, only
shapes and counts.

```bash
fly logs -a vdc-extractor
```

For trace-level detail, run Langfuse self-hosted rather than a managed tracing
service. Traces carry full prompts and responses; with the synthetic corpus
that is harmless, but the moment real documents enter the system a managed
tracer becomes another data processor to disclose. Self-hosting avoids adding
one.

## Rollback

```bash
fly releases -a vdc-extractor
fly deploy --image registry.fly.io/vdc-extractor:deployment-<id>
```

Roll back the tiers in reverse dependency order: web, then extractor, then
rules.

## What is deliberately absent

No Kubernetes, no service mesh, no autoscaling policy, no multi-region
replication. Three containers, one region, scale-to-zero. The traffic is one
demo link and a handful of staff; anything more would be infrastructure built
to look impressive rather than to solve a problem the system actually has.
