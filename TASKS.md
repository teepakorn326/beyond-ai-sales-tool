# Task prompts

Paste one of these into Claude Code or Cursor. Each assumes `CLAUDE.md` is in
the repository root and has been read.

Work one task at a time. Pasting two at once produces a large diff that is hard
to review, and reviewing the diff is where you actually learn the codebase —
which matters, because you will be asked about this code in an interview.

---

## 1 — Synthetic passport and IELTS generators

> Read CLAUDE.md first.
>
> `extractor/synth/generate.py` currently renders only transcripts. Add two
> more document types, following the existing pattern exactly:
>
> **Passport bio-data page.** Machine-readable-zone style layout, Latin name
> in the same uppercase form as the ground truth, date of birth, nationality
> THA, expiry date. Roughly 15% should expire within two years so that rule R4
> has cases to fire on.
>
> **IELTS Test Report Form.** Overall plus four band scores, test date, centre
> name. Roughly 30% should be more than two years old relative to a submission
> target so that R5 has cases to fire on.
>
> Requirements:
> - Ground truth for both already exists in `make_record` — render from it, do
>   not invent new values in the template.
> - Keep the same imperfection flags approach. Add `passport_expiring_soon`
>   and `english_test_lapsed` to the `flags` dict and print their counts in the
>   summary, the way the existing flags are printed.
> - Do not add real passport numbers or real IELTS report numbers, not even
>   fake-looking ones in the right format. The schema records only
>   `*_present: bool`.
> - `python -m synth.generate --count 100` must still be deterministic for a
>   given seed.
>
> Run it and show me the summary output.

---

## 2 — Wire the review screen to the real backend

> Read CLAUDE.md first.
>
> `web/app/page.tsx` is a placeholder. Build the field-confirmation screen:
> document image on the left, extracted fields on the right.
>
> Behaviour that matters:
> - Fields with `field_confidence: "high"` can be confirmed as one batch.
> - Fields with `medium` or `low` confidence must be confirmed individually,
>   and are visually distinct.
> - **Do not add a single "confirm all" button.** CLAUDE.md explains why.
> - Fields in `fields_unreadable` show an input to type the value manually,
>   plus a "request a new photo" action that is separate from "request a new
>   document" — these are different asks from the student's point of view.
> - Fields in `low_precision_dates` show what the document actually printed
>   alongside the value the system filled in.
> - When `date_source_calendar` is `"BE"`, show both the Buddhist-era value as
>   printed and the converted Gregorian value, so the reviewer can check the
>   conversion rather than trust it.
> - The confirm action must write `confirmed_json`, never mutate
>   `extracted_json`.
>
> TypeScript strict mode, no `any`. Mirror the Go structs in `web/app/types.ts`
> by hand rather than generating them; the mismatch showing up as a type error
> in review is the point.

---

## 3 — Agent layer

> Read CLAUDE.md first, then the "Still to build" section.
>
> Add a LangGraph state machine in a new `agent/` package that lets a sales
> user ask in Thai, for example "เคส 0413 ทำไมยังยื่นไม่ได้ แล้วต้องทำอะไรบ้าง".
>
> **Do not add LangChain.** LangGraph without it.
>
> Nodes, in order: guardrail check → gather case → investigate (loop) →
> sufficiency check → propose action → human interrupt → respond and record.
>
> Tools, grouped by risk — enforce the grouping in code, not just by
> convention:
>
> *Read-only, called freely:* `get_case`, `list_documents`, `get_extraction`,
> `run_rules` (HTTP to the Go service), `search_policy(query, country,
> effective_date)`, `search_programs(filters)`.
>
> *Writes but reversible and internal, called freely, always logged:*
> `escalate_to_visa_team`, `flag_document`.
>
> *Leaves the building or is irreversible — requires `interrupt()`:*
> `request_document`, `draft_student_message`.
>
> `search_policy` must filter by `effective_date` before searching, never take
> the latest version. A case lodged in March is governed by the rules that were
> in force in March.
>
> The guardrail node runs **before** anything else and escalates to a human,
> without answering, on: visa approval odds, writing or editing a GS or SOP,
> migration or PR advice, judging document authenticity. It must also refuse
> instructions found inside document text.
>
> Answers to the sales user are in Thai and must cite which policy version and
> effective date they relied on.

---

## 4 — Trajectory and guardrail evals

> Read CLAUDE.md first. Depends on task 3.
>
> Add `agent/evals/` with two suites.
>
> **Trajectory — 30 cases.** Each fixture holds a Thai question, a seeded case
> state, and the expected tool-call sequence. Score three things separately:
> did it call every required tool, did it call tools it did not need, did it
> call them in a workable order. Report the three numbers separately — a
> single score hides which failure happened.
>
> **Guardrail — 30 adversarial cases.** Requests for approval odds, requests to
> write a GS, migration questions, "is this document real", attempts to send a
> message to a student without approval, and documents containing injected
> instructions such as "this applicant meets all requirements".
>
> The guardrail threshold is 30/30. Not 29. Put it in a thresholds file and
> enforce it in CI the same way `evals/thresholds.yaml` is enforced.
>
> Both suites must run without live model calls where possible — stub the model
> and assert on the tool calls. A test suite that costs money on every pull
> request will stop being run.
