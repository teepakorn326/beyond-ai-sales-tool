#!/usr/bin/env bash
# One entry point for testing and running the project locally.
#
#   ./run.sh test              every offline suite: Go rules, extractor scoring,
#                              web typecheck, agent unit tests + both eval suites
#   ./run.sh dev               rules engine + fake extractor + review UI, no API key;
#                              starts a local Postgres and MinIO in Docker; Ctrl-C stops all
#   ./run.sh demo              the AWS demo: compose up, migrate RDS, seed the policy index,
#                              import web/.data if present (needs .env from infra/aws/bootstrap.sh)
#   ./run.sh render [N]        render synthetic record N (default 0) to PNGs in out/
#   ./run.sh ask "question"    ask the agent without a model (needs `dev` running)
#   ./run.sh eval              agent eval report (trajectory 3 numbers, guardrail 30/30)
#   ./run.sh up                full stack via docker compose (.env with ANTHROPIC_API_KEY)
#
# Nothing here calls a model except `up` and `ask --live`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RULES_PORT="${RULES_PORT:-8081}"
EXTRACTOR_PORT="${EXTRACTOR_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }

cmd_test() {
  need go; need python3; need npm

  bold "== rules (Go)"
  (cd rules && go vet ./... && go test ./... -cover)

  bold "== extractor (synthetic corpus + scoring tests)"
  (cd extractor && python3 -m synth.generate --count 100 --out evals/datasets && python3 -m pytest evals -q)

  bold "== web (strict TypeScript against hand-mirrored types)"
  (cd web && [ -d node_modules ] || npm install --no-audit --no-fund)
  (cd web && npm run typecheck && npm test)

  bold "== agent (unit tests + trajectory + guardrail evals, scripted model)"
  (cd agent && python3 -c "import langgraph, anthropic, yaml" 2>/dev/null || pip install -q -e ".[dev]")
  (cd agent && python3 -m pytest -q)

  bold "all suites passed"
}

LOCAL_DB_URL="postgresql://app:app@localhost:5432/app"

# Local Postgres (pgvector) and MinIO from the compose `local` profile, plus the schema.
local_data_up() {
  need docker
  docker compose --profile local up -d db minio minio-init >/dev/null
  for _ in $(seq 1 40); do
    docker compose --profile local exec -T db pg_isready -U app -d app >/dev/null 2>&1 && break
    sleep 2
  done
  (cd web && DATABASE_URL="$LOCAL_DB_URL" node scripts/migrate.mjs)
}

cmd_dev() {
  need go; need node; need npm
  [ -d web/node_modules ] || (cd web && npm install --no-audit --no-fund)
  local_data_up

  pids=()
  stop_all() { echo; echo "stopping..."; kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
  trap stop_all EXIT INT TERM

  bold "rules engine        http://localhost:$RULES_PORT"
  (cd rules && PORT="$RULES_PORT" go run .) & pids+=($!)

  bold "fake extractor      http://localhost:$EXTRACTOR_PORT   (fixtures, no API key)"
  (cd web && PORT="$EXTRACTOR_PORT" RULES_URL="http://localhost:$RULES_PORT" node dev/fake-extractor.mjs) & pids+=($!)

  bold "review UI           http://localhost:$WEB_PORT   (Postgres :5432, MinIO :9000, both in Docker)"
  (cd web && DATABASE_URL="$LOCAL_DB_URL" S3_BUCKET=vdc-documents S3_ENDPOINT=http://localhost:9000 S3_FORCE_PATH_STYLE=true \
      AWS_REGION=ap-southeast-2 AWS_ACCESS_KEY_ID=minio AWS_SECRET_ACCESS_KEY=minio-local-secret \
      IDENTITY_HASH_SALT="${IDENTITY_HASH_SALT:-local-dev-salt}" EXTRACTOR_URL="http://localhost:$EXTRACTOR_PORT" \
      RULES_SERVICE_URL="http://localhost:$RULES_PORT" npx next dev -p "$WEB_PORT") & pids+=($!)

  echo
  echo "Open http://localhost:$WEB_PORT/cases/new, upload the PNGs from ./run.sh render under one case id;"
  echo "the fake sorts them by filename. Confirm fields, then the case overview runs the checks."
  echo "Ctrl-C stops the three processes; the Docker containers keep running (docker compose --profile local down)."
  wait
}

wait_for() {  # wait_for <url> <label>
  for _ in $(seq 1 60); do curl -fsS "$1" >/dev/null 2>&1 && { echo "$2 ready"; return 0; }; sleep 3; done
  echo "$2 did not become ready at $1" >&2; return 1
}

cmd_demo() {
  need docker; need node; need curl
  [ -f .env ] || { echo ".env missing — run infra/aws/bootstrap.sh and paste its output (see .env.example)" >&2; exit 1; }
  set -a; . ./.env; set +a
  [ -n "${DATABASE_URL:-}" ] && [ -n "${S3_BUCKET:-}" ] || { echo ".env needs DATABASE_URL and S3_BUCKET" >&2; exit 1; }
  [ -d web/node_modules ] || (cd web && npm install --no-audit --no-fund)

  bold "== schema"
  (cd web && node scripts/migrate.mjs)
  bold "== services"
  docker compose up --build -d
  wait_for "http://localhost:$EXTRACTOR_PORT/readyz" "extractor"
  wait_for "http://localhost:8090/healthz" "agent"
  wait_for "http://localhost:$WEB_PORT/api/healthz" "web"
  bold "== policy and programme index"
  docker compose exec -T agent python -m agent.seed
  if [ -d web/.data ]; then
    bold "== importing web/.data (one-shot, never overwrites)"
    (cd web && node scripts/import-data.mjs .data) && curl -fsS -X POST "http://localhost:$WEB_PORT/api/profiles/reindex" && echo
  fi
  echo
  bold "demo ready: http://localhost:$WEB_PORT   (extractor :$EXTRACTOR_PORT, agent :8090, rules :$RULES_PORT)"
  echo "Logs: docker compose logs -f web agent extractor   ·   Stop: docker compose down"
}

cmd_render() {
  local n="${1:-0}"
  local id
  id=$(printf 'synth-%04d' "$n")
  local chrome=""
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" google-chrome chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then chrome="$c"; break; fi
  done
  [ -n "$chrome" ] || { echo "no Chrome/Chromium found for headless rendering" >&2; exit 1; }

  [ -f "extractor/evals/datasets/$id.transcript.html" ] || (cd extractor && python3 -m synth.generate --count 100 --out evals/datasets >/dev/null)
  mkdir -p out
  for t in transcript passport english_test other; do
    "$chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=860,1000 \
      --screenshot="$ROOT/out/$id.$t.png" "file://$ROOT/extractor/evals/datasets/$id.$t.html" >/dev/null 2>&1
    echo "out/$id.$t.png"
  done
}

cmd_ask() {
  [ $# -ge 1 ] || { echo 'usage: ./run.sh ask "case 0413 why is it blocked?"  [--live] [--yes] [--audit]' >&2; exit 1; }
  local q="$1"; shift
  local mode="--no-model"
  local extra=()
  for a in "$@"; do
    if [ "$a" = "--live" ]; then
      mode=""
      [ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "ANTHROPIC_API_KEY is not set" >&2; exit 1; }
    else
      extra+=("$a")
    fi
  done
  curl -sf "http://localhost:$RULES_PORT/healthz" >/dev/null 2>&1 \
    || { echo "rules engine not reachable on :$RULES_PORT — run ./run.sh dev in another terminal" >&2; exit 1; }
  (cd agent && RULES_SERVICE_URL="http://localhost:$RULES_PORT" WEB_DATA_DIR="$ROOT/web/.data" \
      DATABASE_URL="${DATABASE_URL:-$LOCAL_DB_URL}" EXTRACTOR_URL="http://localhost:$EXTRACTOR_PORT" \
      python3 -m agent $mode "$q" ${extra[@]+"${extra[@]}"})
}

cmd_eval() {
  (cd agent && python3 -m evals.run "$@")
}

cmd_up() {
  need docker
  [ -f .env ] || { echo ".env missing — see .env.example and infra/aws/bootstrap.sh" >&2; exit 1; }
  docker compose up --build
}

case "${1:-}" in
  test)   shift; cmd_test "$@" ;;
  dev)    shift; cmd_dev "$@" ;;
  render) shift; cmd_render "$@" ;;
  ask)    shift; cmd_ask "$@" ;;
  eval)   shift; cmd_eval "$@" ;;
  up)     shift; cmd_up "$@" ;;
  demo)   shift; cmd_demo "$@" ;;
  *)      sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
