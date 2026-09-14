#!/usr/bin/env bash
# One entry point for testing and running the project locally.
#
#   ./run.sh test              every offline suite: Go rules, extractor scoring,
#                              web typecheck, agent unit tests + both eval suites
#   ./run.sh dev               rules engine + fake extractor + review UI, no API key;
#                              Ctrl-C stops all three
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
  (cd web && npm run typecheck)

  bold "== agent (unit tests + trajectory + guardrail evals, scripted model)"
  (cd agent && python3 -c "import langgraph, anthropic, yaml" 2>/dev/null || pip install -q -e ".[dev]")
  (cd agent && python3 -m pytest -q)

  bold "all suites passed"
}

cmd_dev() {
  need go; need node; need npm
  [ -d web/node_modules ] || (cd web && npm install --no-audit --no-fund)

  pids=()
  stop_all() { echo; echo "stopping..."; kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
  trap stop_all EXIT INT TERM

  bold "rules engine        http://localhost:$RULES_PORT"
  (cd rules && PORT="$RULES_PORT" go run .) & pids+=($!)

  bold "fake extractor      http://localhost:$EXTRACTOR_PORT   (fixtures, no API key)"
  (cd web && PORT="$EXTRACTOR_PORT" RULES_URL="http://localhost:$RULES_PORT" node dev/fake-extractor.mjs) & pids+=($!)

  bold "review UI           http://localhost:$WEB_PORT"
  (cd web && EXTRACTOR_URL="http://localhost:$EXTRACTOR_PORT" npx next dev -p "$WEB_PORT") & pids+=($!)

  echo
  echo "Upload all PNGs from ./run.sh render at once under case id STU-2026-0413 with type"
  echo "'Detect automatically'; the fake sorts them by filename. Confirm the fields, then open"
  echo "/case?case_id=STU-2026-0413&course_end_date=2029-06-30&submission_target=2026-10-31"
  echo "Ctrl-C stops everything."
  wait
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
      python3 -m agent $mode "$q" ${extra[@]+"${extra[@]}"})
}

cmd_eval() {
  (cd agent && python3 -m evals.run "$@")
}

cmd_up() {
  need docker
  [ -f .env ] || { echo ".env missing — add ANTHROPIC_API_KEY (see README)" >&2; exit 1; }
  docker compose up --build
}

case "${1:-}" in
  test)   shift; cmd_test "$@" ;;
  dev)    shift; cmd_dev "$@" ;;
  render) shift; cmd_render "$@" ;;
  ask)    shift; cmd_ask "$@" ;;
  eval)   shift; cmd_eval "$@" ;;
  up)     shift; cmd_up "$@" ;;
  *)      sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
