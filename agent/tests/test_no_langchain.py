"""LangGraph without LangChain. langchain-core is a transitive dependency of
langgraph and cannot be avoided at install time; what can be enforced is
that nothing in this package imports it."""

import re
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent.parent / "agent"
IMPORT = re.compile(r"^\s*(?:from|import)\s+langchain", re.MULTILINE)


def test_no_module_imports_langchain_in_any_form():
    offenders = [
        str(p.relative_to(PACKAGE.parent))
        for p in PACKAGE.rglob("*.py")
        if IMPORT.search(p.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_model_calls_go_through_the_anthropic_sdk_only():
    llm = (PACKAGE / "llm.py").read_text(encoding="utf-8")
    assert "import anthropic" in llm
    others = [
        str(p.name)
        for p in PACKAGE.rglob("*.py")
        if p.name != "llm.py" and re.search(r"^\s*import anthropic|^\s*from anthropic", p.read_text(), re.MULTILINE)
    ]
    assert others == [], "only llm.py may talk to the model"
