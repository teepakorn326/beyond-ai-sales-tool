"""The risk grouping is enforced by the registry, not by convention."""

import pytest

from agent.risk import Approval, RequiresApproval, Risk, RiskViolation, ToolInputError, args_digest
from agent.tools import build_registry

from .conftest import make_services


def test_external_tool_refuses_to_run_without_approval():
    svc = make_services()
    reg = build_registry(svc)
    with pytest.raises(RequiresApproval):
        reg.execute("draft_student_message", {"case_id": "STU-2026-0413", "message_th": "สวัสดี"})
    assert svc.ledger.drafts == []
    assert svc.audit.entries == []


def test_external_tool_runs_with_matching_approval_and_is_logged():
    svc = make_services()
    reg = build_registry(svc)
    args = {"case_id": "STU-2026-0413", "doc_type": "english_test", "reason": "R5"}
    approval = Approval("request_document", args_digest(args), approver="somchai")
    reg.execute("request_document", args, approval=approval)
    assert len(svc.ledger.requests) == 1
    entry = svc.audit.entries[-1]
    assert entry["tool"] == "request_document"
    assert entry["risk"] == "external"
    assert entry["approver"] == "somchai"
    assert "reason" in entry["arg_keys"] and "R5" not in str(entry)  # keys only, never values


def test_approval_is_bound_to_tool_and_arguments():
    svc = make_services()
    reg = build_registry(svc)
    args = {"case_id": "STU-2026-0413", "doc_type": "english_test", "reason": "R5"}
    approval = Approval("request_document", args_digest(args), approver="somchai")
    with pytest.raises(RiskViolation):
        reg.execute("request_document", {**args, "doc_type": "passport"}, approval=approval)
    with pytest.raises(RiskViolation):
        reg.execute("draft_student_message", {"case_id": "STU-2026-0413", "message_th": "x"}, approval=approval)
    assert svc.ledger.requests == [] and svc.ledger.drafts == []


def test_reversible_tool_runs_freely_but_is_always_logged():
    svc = make_services()
    reg = build_registry(svc)
    reg.execute("flag_document", {"doc_id": "doc-tr", "reason": "test"})
    assert svc.ledger.flags and svc.audit.entries[-1]["risk"] == "reversible"


def test_read_tool_is_not_logged():
    svc = make_services()
    reg = build_registry(svc)
    reg.execute("get_case", {"case_id": "0413"})
    assert svc.audit.entries == []


def test_every_tool_has_the_documented_risk():
    reg = build_registry(make_services())
    assert set(reg.names(Risk.READ)) == {
        "get_case", "list_documents", "get_extraction", "run_rules", "search_policy", "search_programs",
    }
    assert set(reg.names(Risk.REVERSIBLE)) == {"escalate_to_visa_team", "flag_document"}
    assert set(reg.names(Risk.EXTERNAL)) == {"request_document", "draft_student_message"}


def test_unknown_argument_is_rejected_before_the_handler_runs():
    reg = build_registry(make_services())
    with pytest.raises(ToolInputError):
        reg.execute("get_case", {"case_id": "0413", "approve": True})


def test_get_extraction_returns_confirmed_values_only():
    reg = build_registry(make_services())
    unconfirmed = reg.execute("get_extraction", {"doc_id": "doc-ce"})
    assert unconfirmed["confirmed"] is False and unconfirmed["fields"] is None
    confirmed = reg.execute("get_extraction", {"doc_id": "doc-pp"})
    assert confirmed["fields"]["given_name_latin"] == "THANAWAT"
