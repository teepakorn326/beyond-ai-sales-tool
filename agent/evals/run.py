"""Run the trajectory and guardrail suites and print a report.

    python -m evals.run                 # stubbed model, free, what CI runs
    python -m evals.run --live          # real model for the investigate loop; costs money
    python -m evals.run --suite guardrail

Exit status is non-zero when any number is below evals/thresholds.yaml.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from agent.graph import Agent, Deps, RunResult
from agent.llm import Model, ScriptedModel, Turn, tool_turn
from agent.tools import build_registry

from .scoring import (
    Aggregate,
    GuardrailOutcome,
    TrajectoryScore,
    aggregate,
    judge_guardrail,
    score_trajectory,
)
from .world import build_services

HERE = Path(__file__).parent
DATASETS = HERE / "datasets"


def load_fixtures(name: str) -> list[dict[str, Any]]:
    return yaml.safe_load((DATASETS / f"{name}.yaml").read_text(encoding="utf-8"))


def load_thresholds() -> dict[str, Any]:
    return yaml.safe_load((HERE / "thresholds.yaml").read_text(encoding="utf-8"))


def script_from(fixture: dict[str, Any]) -> list[Turn]:
    turns = []
    for step in fixture.get("script", []):
        calls = [(c[0], c[1] if len(c) > 1 else {}) for c in step.get("tools", [])]
        if calls:
            turns.append(tool_turn(*calls, text=step.get("text", "")))
        else:
            turns.append(Turn(text=step.get("text", "")))
    return turns


@dataclass
class CaseRun:
    fixture: dict[str, Any]
    result: RunResult
    services: Any
    model_calls: int


def run_case(fixture: dict[str, Any], live_model: Model | None = None) -> CaseRun:
    svc = build_services(fixture.get("seed"))
    model: Model = live_model if live_model is not None else ScriptedModel(script_from(fixture))
    agent = Agent(Deps(model=model, registry=build_registry(svc), services=svc))
    result = agent.ask(fixture["question"])
    approve = bool(fixture.get("approve", False))
    guard = 0
    while result.pending and guard < 5:
        result = agent.resume(result.thread_id, approved=approve, approver="eval")
        guard += 1
    calls = len(model.calls) if isinstance(model, ScriptedModel) else -1
    return CaseRun(fixture, result, svc, calls)


def run_trajectory(live_model: Model | None = None) -> list[tuple[dict[str, Any], TrajectoryScore]]:
    out = []
    for fx in load_fixtures("trajectory"):
        run = run_case(fx, live_model)
        out.append((fx, score_trajectory(run.result.trajectory, fx["expected"])))
    return out


def run_guardrail(live_model: Model | None = None) -> list[tuple[dict[str, Any], GuardrailOutcome]]:
    out = []
    for fx in load_fixtures("guardrail"):
        run = run_case(fx, live_model)
        outcome = judge_guardrail(
            fx["expect"],
            state=run.result.state,
            trajectory=run.result.trajectory,
            ledger_drafts=len(run.services.ledger.drafts),
            ledger_requests=len(run.services.ledger.requests),
            model_calls=max(run.model_calls, 0),
            answer=run.result.answer or "",
        )
        out.append((fx, outcome))
    return out


def trajectory_report(rows: list[tuple[dict[str, Any], TrajectoryScore]], thresholds: dict[str, float]) -> tuple[Aggregate, list[str]]:
    agg = aggregate([s for _, s in rows])
    lines = ["trajectory"]
    for fx, s in rows:
        flags = []
        if s.missing:
            flags.append("missing=" + ",".join(s.missing))
        if s.unnecessary:
            flags.append("unnecessary=" + ",".join(s.unnecessary))
        if s.disordered:
            flags.append("disordered=" + ",".join(s.disordered))
        lines.append(f"  {fx['id']:10} req={s.required:.2f} clean={s.no_unnecessary:.0f} order={s.order:.2f}  {' '.join(flags)}")
    lines.append("")
    failures = []
    for key, value in (("required_tools", agg.required), ("no_unnecessary_tools", agg.no_unnecessary), ("workable_order", agg.order)):
        floor = thresholds[key]
        mark = "ok " if value >= floor else "LOW"
        lines.append(f"  {key:22} {value:.3f}  floor {floor:.2f}  {mark}  ({agg.cases} cases)")
        if value < floor:
            failures.append(f"trajectory.{key} {value:.3f} < {floor:.2f}")
    return agg, lines + [""] + failures


def guardrail_report(rows: list[tuple[dict[str, Any], GuardrailOutcome]], thresholds: dict[str, float]) -> tuple[float, list[str]]:
    passed = sum(1 for _, o in rows if o.passed)
    rate = passed / len(rows) if rows else 0.0
    lines = ["guardrail"]
    by_cat: dict[str, list[bool]] = {}
    for fx, o in rows:
        by_cat.setdefault(fx["category"], []).append(o.passed)
        lines.append(f"  {fx['id']:10} {'pass' if o.passed else 'FAIL':4} {fx['category']:18} {o.reason}")
    lines.append("")
    for cat, results in by_cat.items():
        lines.append(f"  {cat:22} {sum(results)}/{len(results)}")
    floor = thresholds["pass_rate"]
    mark = "ok " if rate >= floor else "LOW"
    lines.append(f"  {'pass_rate':22} {rate:.3f}  floor {floor:.2f}  {mark}  ({passed}/{len(rows)})")
    failures = [] if rate >= floor else [f"guardrail.pass_rate {passed}/{len(rows)} < {floor:.2f}"]
    return rate, lines + [""] + failures


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="use the real model (costs money)")
    ap.add_argument("--suite", choices=["trajectory", "guardrail", "all"], default="all")
    args = ap.parse_args(argv)

    live = None
    if args.live:
        from agent.llm import AnthropicModel

        live = AnthropicModel()

    thresholds = load_thresholds()
    failures: list[str] = []
    if args.suite in ("trajectory", "all"):
        _, lines = trajectory_report(run_trajectory(live), thresholds["trajectory"])
        print("\n".join(lines))
        failures += [ln for ln in lines if ln.startswith("trajectory.")]
    if args.suite in ("guardrail", "all"):
        _, lines = guardrail_report(run_guardrail(live), thresholds["guardrail"])
        print("\n".join(lines))
        failures += [ln for ln in lines if ln.startswith("guardrail.")]

    if failures:
        print("BELOW THRESHOLD:\n  " + "\n  ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
