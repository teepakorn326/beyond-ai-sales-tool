"""Ask the agent a question from the shell.

    python -m agent "case 0413 why can't it be lodged yet and what has to happen?"
    python -m agent --no-model "case 0413 ..."     # deterministic nodes only, no API key

Questions may be asked in Thai or English; answers are in English.

Reads confirmed documents from the web tier's store (WEB_DATA_DIR) and case
metadata from <WEB_DATA_DIR>/cases.json. When the agent proposes an action
that reaches the student, it stops and asks on stdin.
"""

from __future__ import annotations

import argparse
import sys

from .config import settings
from .graph import Agent, Deps
from .llm import AnthropicModel, ScriptedModel
from .tools import build_registry
from .wiring import build_services


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("question")
    ap.add_argument("--no-model", action="store_true", help="run without calling a model")
    ap.add_argument("--yes", action="store_true", help="approve proposals without asking")
    ap.add_argument("--audit", action="store_true", help="print audit log lines to stdout")
    ap.add_argument("--data", default=settings.web_data_dir, help="web tier .data directory")
    args = ap.parse_args(argv)

    svc = build_services(audit_emit=args.audit, data_dir=args.data)
    model = ScriptedModel([]) if args.no_model else AnthropicModel()
    agent = Agent(Deps(model=model, registry=build_registry(svc), services=svc))

    result = agent.ask(args.question)
    while result.pending:
        p = result.pending
        print(f"\nProposal: {p['tool']} {p['args']}\nReason: {p['reason']}", file=sys.stderr)
        if args.yes:
            approved = True
        elif not sys.stdin.isatty():
            # No person at the keyboard means no approval. Never the other way.
            print("No one to answer (stdin is not a terminal): treated as not approved. Use --yes to approve.", file=sys.stderr)
            approved = False
        else:
            try:
                approved = input("Approve this action? [y/N] ").strip().lower() == "y"
            except EOFError:
                approved = False
        result = agent.resume(result.thread_id, approved=approved, approver="cli")

    print("\n" + (result.answer or ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
