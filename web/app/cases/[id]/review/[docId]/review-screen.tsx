"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent } from "react";

import { ConfidenceBadge, Pill, ProvenanceChip } from "../../../../components/badges";
import { Icon } from "../../../../components/icons";
import { TopBar } from "../../../../components/shell";
import { ConfirmationDialog, errorOf, useToast } from "../../../../components/ui";
import { caseLabel, fmtDate, fmtDateTime } from "../../../../lib/format";
import { asPrinted, DOC_TYPE_LABELS, fieldViews, NAME_FIELDS, parseInput, requiredFields, type FieldView } from "../../../../lib/review";
import type { FieldValue, RequestKind, ReviewDocument, SourceCalendar } from "../../../../types";
import { DocumentViewer } from "./document-viewer";

export interface DocTab {
  docId: string;
  label: string;
  reviewed: boolean;
  left: number;
}

function show(v: FieldValue, kind: FieldView["kind"]): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "Present · not stored" : "Not present";
  if (kind === "date" && typeof v === "string") return fmtDate(v);
  return String(v);
}

// Sub-components live at module level so an input keeps focus across renders.

function DateNote({ v, calendar }: { v: FieldView; calendar: SourceCalendar | null }) {
  if (v.kind !== "date" || typeof v.value !== "string") return null;
  const be = calendar === "BE";
  if (!be && !v.lowPrecision) return null;
  return (
    <div className="note">
      <div className="row" style={{ color: "var(--info-text)", fontWeight: 600, fontSize: 13 }}>
        <Icon name="info" size={14} />
        {be ? "Buddhist Era date detected" : "Date normalised by system"}
      </div>
      <div className="pair">
        <div className="box">
          <div className="label">Printed</div>
          <div className="value mono">{asPrinted(v.value, calendar, v.lowPrecision)}</div>
          {v.lowPrecision && <div className="muted small">no day given</div>}
        </div>
        <div className="box">
          <div className="label">{be ? "Converted" : "Normalised"}</div>
          <div className="value">
            {fmtDate(v.value)} <span className="mono muted" style={{ fontWeight: 400 }}>{v.value}</span>
          </div>
          {v.lowPrecision && <div className="muted small">day filled by system</div>}
        </div>
      </div>
    </div>
  );
}

function Editor({ v, draft, error, busy, submitLabel, onChange, onSubmit, onCancel }: { v: FieldView; draft: string; error: string | undefined; busy: boolean; submitLabel: string; onChange: (raw: string) => void; onSubmit: () => void; onCancel?: () => void }) {
  const common = {
    id: `input-${v.name}`,
    value: draft,
    disabled: busy,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") onSubmit();
      if (e.key === "Escape" && onCancel) onCancel();
    },
    className: `input sm${error ? " error" : ""}`,
    style: { fontWeight: 600 } as const,
  };
  return (
    <div className="stack" style={{ gap: 6, marginTop: 8 }}>
      {v.kind === "boolean" ? (
        <select {...common}>
          <option value="true">Present</option>
          <option value="false">Not present</option>
        </select>
      ) : (
        <input {...common} type={v.kind === "date" ? "date" : v.kind === "number" ? "number" : "text"} step={v.kind === "number" ? "0.01" : undefined} placeholder={v.kind === "date" ? "YYYY-MM-DD (Gregorian)" : "Type the value as printed"} autoFocus />
      )}
      {error && <span className="small" style={{ color: "var(--error-text)" }}>{error}</span>}
      <div className="row wrap">
        <button type="button" className="btn primary sm" disabled={busy} onClick={onSubmit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className="muted small">Enter saves · Esc cancels</span>
      </div>
      {NAME_FIELDS.has(v.name) && (
        <span className="small" style={{ color: "var(--warning-text)" }}>
          Edit only if the system misread the page. If the document really spells the name differently from the passport, do not edit it to match: the document has to be reissued.
        </span>
      )}
    </div>
  );
}

export function ReviewScreen({ initial, caseId, tabs }: { initial: ReviewDocument; caseId: string; tabs: DocTab[] }) {
  const router = useRouter();
  const toast = useToast();
  const [doc, setDoc] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, true>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [requestDoc, setRequestDoc] = useState<string | null>(null);

  const x = doc.extracted_json;
  const calendar = x.date_source_calendar;
  const views = useMemo(() => fieldViews(doc), [doc]);
  const required = useMemo(() => requiredFields(x), [x]);
  const done = required.filter((n) => n in doc.confirmations).length;

  const batch = views.filter((v) => v.status === "high" && !editing[v.name]);
  const low = views.filter((v) => v.status === "low" && !editing[v.name]);
  const medium = views.filter((v) => v.status === "medium" && !editing[v.name]);
  const unreadable = views.filter((v) => v.status === "unreadable");
  const reediting = views.filter((v) => (v.status === "confirmed" || v.status === "high" || v.status === "medium" || v.status === "low") && editing[v.name]);
  const confirmed = views.filter((v) => v.status === "confirmed" && !editing[v.name]);
  const absent = views.filter((v) => v.status === "absent");

  const flagged = useMemo(() => {
    const s = new Set<number>();
    for (const v of views) if (v.status !== "confirmed" && v.status !== "absent" && v.page !== null) s.add(Math.max(0, v.page - 1));
    return s;
  }, [views]);

  const base = `/cases/${encodeURIComponent(caseId)}`;
  const idx = tabs.findIndex((t) => t.docId === doc.id);
  const prev = idx > 0 ? tabs[idx - 1] : null;
  const next = idx >= 0 && idx < tabs.length - 1 ? tabs[idx + 1] : null;
  const allReviewed = tabs.every((t) => (t.docId === doc.id ? doc.confirmed_json !== null : t.reviewed));

  async function post(pathname: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/${pathname}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorOf(json, res.status, "Could not save"));
        return false;
      }
      setDoc(json as ReviewDocument);
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function draftOf(v: FieldView): string {
    if (v.name in drafts) return drafts[v.name];
    const b = v.confirmedValue !== undefined ? v.confirmedValue : v.value;
    return b === null ? "" : String(b);
  }
  function dropKey(name: string) {
    setEditing(({ [name]: _e, ...rest }) => rest);
    setDrafts(({ [name]: _d, ...rest }) => rest);
    setFieldErrors(({ [name]: _f, ...rest }) => rest);
  }
  async function confirmOne(v: FieldView, value?: FieldValue) {
    let val: FieldValue;
    if (value !== undefined) val = value;
    else {
      const parsed = parseInput(v.name, draftOf(v));
      if (!parsed.ok) {
        setFieldErrors((e) => ({ ...e, [v.name]: parsed.error }));
        return;
      }
      val = parsed.value;
    }
    if (await post("confirm", { fields: [{ name: v.name, value: val }] })) {
      dropKey(v.name);
      toast("ok", `${v.label} confirmed`);
    }
  }
  /** Confirms exactly the high-confidence fields as extracted. Medium, low and unreadable never enter this list. */
  async function confirmBatch() {
    if (await post("confirm", { fields: batch.map((v) => ({ name: v.name, value: v.value })) })) toast("ok", `${batch.length} field${batch.length === 1 ? "" : "s"} confirmed`);
  }
  async function request(kind: RequestKind, field: string) {
    if (await post("requests", { kind, field })) toast("ok", kind === "new_photo" ? "New photo requested" : "New document requested");
  }
  const requestsFor = (name: string) => doc.requests.filter((r) => r.field === name);
  const goPage = (p: number | null) => p !== null && setPage(Math.max(0, Math.min(doc.page_count - 1, p - 1)));

  const pageLink = (v: FieldView) =>
    v.page !== null ? (
      <button type="button" className="btn ghost sm" style={{ height: 22, padding: "0 6px", fontSize: 12 }} onClick={() => goPage(v.page)}>
        p.{v.page}
      </button>
    ) : null;

  const band = (v: FieldView) => (v.status === "confirmed" ? (v.confidence ?? "low") : v.status === "unreadable" ? "unreadable" : v.status === "absent" ? "low" : v.status);

  const IndividualCard = ({ v, tone }: { v: FieldView; tone: "warn" | "err" | "info" }) => {
    const isEdit = !!editing[v.name];
    const wasConfirmed = v.status === "confirmed";
    return (
      <div id={`field-${v.name}`} className={`field stripe ${tone}`}>
        <div className="head">
          <span className="label">{v.label}</span>
          <ProvenanceChip kind={wasConfirmed ? (v.confirmedValue !== v.value ? "edited" : "confirmed") : "extracted"} />
        </div>
        {!isEdit && <div className="value" style={{ fontSize: 15 }}>{show(v.value, v.kind)}</div>}
        <div className="meta">
          <ConfidenceBadge band={band(v)} />
          {pageLink(v)}
        </div>
        {!isEdit && <DateNote v={v} calendar={calendar} />}
        {isEdit ? (
          <Editor v={v} draft={draftOf(v)} error={fieldErrors[v.name]} busy={busy} submitLabel="Save and confirm" onChange={(raw) => setDrafts((d) => ({ ...d, [v.name]: raw }))} onSubmit={() => confirmOne(v)} onCancel={() => dropKey(v.name)} />
        ) : (
          <div className="actions">
            <button type="button" className="btn primary sm" disabled={busy} onClick={() => confirmOne(v, v.value)}>
              {v.kind === "date" && (calendar === "BE" || v.lowPrecision) ? "Confirm conversion" : "Confirm"}
            </button>
            <button type="button" className="btn secondary sm" disabled={busy} onClick={() => setEditing((e) => ({ ...e, [v.name]: true }))}>
              Edit
            </button>
            {v.status === "low" && (
              <>
                <button type="button" className="btn secondary sm" disabled={busy} onClick={() => request("new_photo", v.name)}>
                  <Icon name="camera" size={14} />
                  Request new photo
                </button>
                <button type="button" className="btn external sm" disabled={busy} onClick={() => setRequestDoc(v.name)}>
                  <Icon name="doc" size={14} />
                  Request new document
                </button>
              </>
            )}
          </div>
        )}
        {requestsFor(v.name).map((r) => (
          <div key={r.created_at} className="row small" style={{ marginTop: 8, color: "var(--warning-text)" }}>
            <Icon name="mail" size={12} />
            {r.kind === "new_photo" ? "New photo" : "New document"} requested {fmtDateTime(r.created_at)} · not yet sent to the student; a person relays it.
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <TopBar
        crumbs={[{ label: "Cases", href: "/cases" }, { label: caseLabel(caseId), href: base }, { label: "Review", href: `${base}/review` }, { label: DOC_TYPE_LABELS[doc.doc_type] }]}
        actions={
          <>
            {prev && (
              <Link href={`${base}/review/${prev.docId}`} className="btn secondary">
                <Icon name="chevl" size={14} />
                {prev.label}
              </Link>
            )}
            {next && (
              <Link href={`${base}/review/${next.docId}`} className="btn secondary">
                {next.label}
                <Icon name="chev" size={14} />
              </Link>
            )}
            <Link href={base} className={`btn primary${allReviewed ? "" : " disabled"}`} aria-disabled={!allReviewed} title={allReviewed ? undefined : "Every field on every document must be confirmed first"}>
              Finish review
            </Link>
          </>
        }
      />
      <main className="content" style={{ gap: 16 }}>
        <div className="tabs" role="tablist">
          {tabs.map((t) => {
            const cur = t.docId === doc.id;
            const reviewed = cur ? doc.confirmed_json !== null : t.reviewed;
            const left = cur ? required.length - done : t.left;
            return (
              <Link key={t.docId} href={`${base}/review/${t.docId}`} className={`tab${cur ? " on" : ""}`} role="tab" aria-selected={cur}>
                {reviewed && <Icon name="check" size={14} />}
                {t.label}
                {!reviewed && <span className="count">{left} left</span>}
              </Link>
            );
          })}
        </div>

        <div className="split-review">
          <DocumentViewer docId={doc.id} label={DOC_TYPE_LABELS[doc.doc_type]} pageCount={doc.page_count} page={page} onPage={setPage} flaggedPages={flagged} />

          <div className="review-panel stack" style={{ gap: 8 }}>
            <div>
              <h2 className="h2">Review extracted information</h2>
              <div className="row wrap" style={{ marginTop: 4, gap: 10 }}>
                <span className="t2">Document: {DOC_TYPE_LABELS[doc.doc_type]}</span>
                {doc.confirmed_json ? (
                  <Pill tone="ok" icon="check">
                    Reviewed
                  </Pill>
                ) : (
                  <Pill tone="warn" icon="tri">
                    Needs review
                  </Pill>
                )}
                <span className="muted">
                  {done} of {required.length} confirmed
                </span>
                <span className="spacer" />
                <Link href={`${base}/classify`} className="btn ghost sm">
                  Change type
                </Link>
              </div>
              {doc.classification && (
                <div className="muted small" style={{ marginTop: 4 }}>
                  Type detected by the system ({doc.classification.confidence} confidence{doc.classification.reason ? `: ${doc.classification.reason}` : ""}).
                </div>
              )}
            </div>

            {error && <div className="alert">{error}</div>}

            {batch.length > 0 && (
              <div className="group">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="row">
                    <ConfidenceBadge band="high" />
                    <span className="muted">
                      {batch.length} field{batch.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  {/* The only batch action in the product. Medium, low and unreadable fields never enter it. */}
                  <button type="button" className="btn primary sm" disabled={busy} onClick={confirmBatch}>
                    Confirm {batch.length} field{batch.length === 1 ? "" : "s"}
                  </button>
                </div>
                <div className="fields">
                  {batch.map((v) => (
                    <div key={v.name} id={`field-${v.name}`} className="field" style={{ padding: "8px 10px" }}>
                      <div className="head">
                        <span className="label">{v.label}</span>
                        <button type="button" className="btn ghost sm" style={{ height: 22, padding: "0 6px", fontSize: 12 }} onClick={() => setEditing((e) => ({ ...e, [v.name]: true }))}>
                          Edit
                        </button>
                      </div>
                      <div className="value" style={{ fontSize: 13 }}>{show(v.value, v.kind)}</div>
                      <DateNote v={v} calendar={calendar} />
                      {pageLink(v)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {low.map((v) => (
              <IndividualCard key={v.name} v={v} tone="err" />
            ))}
            {medium.map((v) => (
              <IndividualCard key={v.name} v={v} tone="warn" />
            ))}
            {reediting.map((v) => (
              <IndividualCard key={v.name} v={v} tone="info" />
            ))}

            {unreadable.map((v) => (
              <div key={v.name} id={`field-${v.name}`} className="field stripe err">
                <div className="head">
                  <span className="label">{v.label}</span>
                  <ProvenanceChip kind="extracted" />
                </div>
                <div className="meta" style={{ marginTop: 2 }}>
                  <ConfidenceBadge band="unreadable" />
                  {pageLink(v)}
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  If you can read it from the image, type the value. If the photo is unclear, request a new photo. If the document itself is damaged or missing, request a new document.
                </div>
                <Editor v={v} draft={draftOf(v)} error={fieldErrors[v.name]} busy={busy} submitLabel="Save typed value" onChange={(raw) => setDrafts((d) => ({ ...d, [v.name]: raw }))} onSubmit={() => confirmOne(v)} />
                <div className="actions">
                  <button type="button" className="btn secondary sm" disabled={busy} onClick={() => request("new_photo", v.name)}>
                    <Icon name="camera" size={14} />
                    Request new photo
                  </button>
                  <button type="button" className="btn external sm" disabled={busy} onClick={() => setRequestDoc(v.name)}>
                    <Icon name="doc" size={14} />
                    Request new document
                  </button>
                </div>
                {requestsFor(v.name).map((r) => (
                  <div key={r.created_at} className="row small" style={{ marginTop: 8, color: "var(--warning-text)" }}>
                    <Icon name="mail" size={12} />
                    {r.kind === "new_photo" ? "New photo" : "New document"} requested {fmtDateTime(r.created_at)} · not yet sent to the student; a person relays it.
                  </div>
                ))}
              </div>
            ))}

            {confirmed.map((v) => {
              const edited = v.confirmedValue !== v.value;
              return (
                <div key={v.name} id={`field-${v.name}`} className={`field collapsed stripe ${edited ? "info" : "ok"}`} style={{ flexWrap: "wrap" }}>
                  <span className="label" style={{ width: 150 }}>
                    {v.label}
                  </span>
                  <span className="value">{show(v.confirmedValue ?? null, v.kind)}</span>
                  <span className="spacer" />
                  <ProvenanceChip kind={edited ? "edited" : "confirmed"} />
                  <button type="button" className="btn ghost sm" style={{ height: 22, padding: "0 6px", fontSize: 12 }} onClick={() => setEditing((e) => ({ ...e, [v.name]: true }))}>
                    Edit
                  </button>
                  {edited && (
                    <div className="muted small" style={{ width: "100%", paddingLeft: 160 }}>
                      Extracted: {show(v.value, v.kind)}
                    </div>
                  )}
                </div>
              );
            })}

            {absent.length > 0 && <div className="muted small">Not on this document: {absent.map((v) => v.label).join(", ")}</div>}

            {x.suspicious_content && (
              <details className="disclosure">
                <summary>
                  <Icon name="chev" size={12} />
                  Document contained instruction-like text (recorded, not acted on)
                </summary>
                <div className="card compact" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                  <span className="mono">{x.suspicious_content}</span>
                </div>
              </details>
            )}

            {doc.confirmed_json && (
              <div className="card compact stripe ok">
                <div className="row wrap" style={{ justifyContent: "space-between" }}>
                  <span>All fields confirmed {fmtDateTime(doc.confirmed_json.confirmed_at)}.</span>
                  <Link href={next ? `${base}/review/${next.docId}` : base} className="btn primary sm">
                    {next ? `Next: ${next.label}` : "Back to case"}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <ConfirmationDialog
        open={requestDoc !== null}
        title="Request a new document?"
        body="This records that the student must supply a new copy of this document. Nothing is sent from here: a person contacts the student, and the request stays visible on the case until a new document arrives."
        confirmLabel="Record request"
        busy={busy}
        onCancel={() => setRequestDoc(null)}
        onConfirm={async () => {
          if (requestDoc) await request("new_document", requestDoc);
          setRequestDoc(null);
        }}
      />
    </>
  );
}
