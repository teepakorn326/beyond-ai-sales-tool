"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "../../components/icons";
import { ConfirmationDialog, errorOf, useToast } from "../../components/ui";
import type { CaseMeta } from "../../lib/case-status";
import { DOC_TYPE_LABELS } from "../../lib/review";
import type { Check, DocType } from "../../types";

/**
 * What a person can do about one rule result. The options follow the
 * domain's authority rule: a name or date conflict is resolved by confirming
 * the person or requesting a reissued document, never by editing a stored
 * value to match.
 */
export function CheckActions({ caseId, check, acknowledged, docIdByType }: { caseId: string; check: Check; acknowledged: boolean; docIdByType: Partial<Record<DocType, string>> }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<DocType | null>(null);
  const base = `/cases/${encodeURIComponent(caseId)}`;

  async function post(url: string, body: unknown, done: string): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        toast("err", errorOf(await res.json().catch(() => null), res.status));
        return;
      }
      toast("ok", done);
      router.refresh();
    } catch {
      toast("err", "Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  const ack = (undo: boolean) => post(`/api/cases/${encodeURIComponent(caseId)}/acknowledge`, { rule_id: check.rule_id, undo }, undo ? "Confirmation removed" : "Recorded as confirmed by reviewer");
  const review = (t: DocType, label: string) => {
    const id = docIdByType[t];
    return id ? (
      <Link key={t} href={`${base}/review/${id}`} className="btn ghost sm">
        {label}
      </Link>
    ) : null;
  };
  const requestBtn = (t: DocType, label: string) =>
    docIdByType[t] ? (
      <button key={`req-${t}`} type="button" className="btn external sm" onClick={() => setRequest(t)} disabled={busy}>
        <Icon name="doc" size={14} />
        {label}
      </button>
    ) : null;

  let buttons: React.ReactNode[] = [];
  if (check.status === "pending") {
    buttons = [
      <Link key="open" href={`${base}#documents`} className="btn ghost sm" onClick={(e) => e.preventDefault()} aria-hidden="true" tabIndex={-1} style={{ display: "none" }}>
        Documents
      </Link>,
    ];
  } else if (check.verdict === "warn") {
    buttons = acknowledged
      ? [
          <button key="undo" type="button" className="btn ghost sm" onClick={() => ack(true)} disabled={busy}>
            Undo confirmation
          </button>,
        ]
      : [
          <button key="ack" type="button" className="btn primary sm" onClick={() => ack(false)} disabled={busy}>
            {check.rule_id === "R1" ? "Confirm same person" : "Confirm and continue"}
          </button>,
          check.rule_id === "R1" ? requestBtn("transcript", "Request reissued transcript") : null,
          check.rule_id === "R4" ? requestBtn("passport", "Request renewed passport") : null,
          check.rule_id === "R5" ? requestBtn("english_test", "Request new English test") : null,
          check.rule_id === "R1" || check.rule_id === "R2" ? review("transcript", "Compare documents") : null,
          check.rule_id === "R3" ? review("degree_certificate", "Open certificate") : null,
        ];
  } else if (check.verdict === "block") {
    switch (check.rule_id) {
      case "R1":
        buttons = [requestBtn("transcript", "Request reissued transcript"), review("transcript", "Compare documents")];
        break;
      case "R2":
        buttons = check.detail.includes("543")
          ? [review("transcript", "Re-check the transcript dates"), review("english_test", "Re-check the English test")]
          : [requestBtn("transcript", "Request reissued transcript"), review("transcript", "Compare documents")];
        break;
      case "R3":
        buttons = [review("transcript", "Open transcript"), review("degree_certificate", "Open certificate")];
        break;
      case "R4":
        buttons = [
          requestBtn("passport", "Request renewed passport"),
          <a key="meta" href="#case-details" className="btn secondary sm">
            Change course end date
          </a>,
        ];
        break;
      case "R5":
        buttons = [
          requestBtn("english_test", "Request new English test"),
          <a key="meta" href="#case-details" className="btn secondary sm">
            Change submission target
          </a>,
        ];
        break;
    }
  }

  const reqDoc = request ? docIdByType[request] : undefined;
  return (
    <>
      {buttons.filter(Boolean)}
      <ConfirmationDialog
        open={request !== null}
        title={`Request a new ${request ? DOC_TYPE_LABELS[request].toLowerCase() : "document"}?`}
        body="This records that the student must supply a reissued document. Nothing is sent from here: a person contacts the student, and the request stays visible on the case until a new document arrives."
        confirmLabel="Record request"
        busy={busy}
        onCancel={() => setRequest(null)}
        onConfirm={async () => {
          if (!reqDoc) return;
          await post(`/api/documents/${reqDoc}/requests`, { kind: "new_document" }, "Request recorded on the case");
          setRequest(null);
        }}
      />
    </>
  );
}

/** Intake, dates and assignee. Inline, saved on blur, no dialog. */
export function CaseDetailsCard({ meta }: { meta: CaseMeta }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    intake: meta.intake ?? "",
    submission_target: meta.submission_target ?? "",
    course_end_date: meta.course_end_date ?? "",
    assignee: meta.assignee ?? "",
    country: meta.country,
  });
  const [busy, setBusy] = useState(false);

  async function save(patch: Partial<typeof form>) {
    const next = { ...form, ...patch };
    setForm(next);
    setBusy(true);
    try {
      const res = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ case_id: meta.case_id, ...next }) });
      if (!res.ok) {
        toast("err", errorOf(await res.json().catch(() => null), res.status, "Could not save"));
        return;
      }
      toast("ok", "Case details saved");
      router.refresh();
    } catch {
      toast("err", "Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, key: keyof typeof form, type: string, hint?: string) => (
    <label className="stack" style={{ gap: 2 }}>
      <span className="label">{label}</span>
      <input className="input sm" type={type} value={form[key]} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} onBlur={(e) => e.target.value !== (meta[key === "country" ? "country" : key] ?? "") && save({ [key]: e.target.value })} />
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );

  return (
    <div className="card" id="case-details">
      <div className="overline">Case details</div>
      <div className="stack" style={{ gap: 10, marginTop: 8 }}>
        {field("Intake", "intake", "month")}
        {field("Submission target", "submission_target", "date", "R5 checks the English test against this date")}
        {field("Course end date", "course_end_date", "date", "R4 checks the passport against this date")}
        <label className="stack" style={{ gap: 2 }}>
          <span className="label">Destination</span>
          <select className="select" value={form.country} disabled={busy} onChange={(e) => save({ country: e.target.value === "NZ" ? "NZ" : "AU" })}>
            <option value="AU">Australia</option>
            <option value="NZ">New Zealand</option>
          </select>
        </label>
        {field("Assigned reviewer", "assignee", "text")}
      </div>
    </div>
  );
}
