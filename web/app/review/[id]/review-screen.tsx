"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type CSSProperties } from "react";

import {
  asPrinted,
  DOC_TYPE_LABELS,
  fieldViews,
  NAME_FIELDS,
  parseInput,
  requiredFields,
  type FieldView,
} from "../../lib/review";
import type { FieldValue, RequestKind, ReviewDocument, SourceCalendar } from "../../types";
import DocTypeBar from "./doc-type-bar";

const TONE = {
  pass: "#2F6B4F",
  warn: "#9C6410",
  block: "#933731",
  muted: "#7C8D95",
  line: "#D8DEDC",
  ink: "#17272E",
  paper: "#fff",
};

const REQUEST_LABEL: Record<RequestKind, string> = {
  new_photo: "request a new photo",
  new_document: "request a new document",
};

const card: CSSProperties = {
  background: TONE.paper,
  border: `1px solid ${TONE.line}`,
  borderRadius: 6,
  padding: "10px 14px",
  marginBottom: 8,
  fontSize: 14,
};

const btn: CSSProperties = {
  padding: "6px 12px",
  border: `1px solid ${TONE.ink}`,
  background: TONE.ink,
  color: "#fff",
  borderRadius: 4,
  cursor: "pointer",
};

const btnQuiet: CSSProperties = { ...btn, background: "transparent", color: TONE.ink };
const btnSmall: CSSProperties = { ...btnQuiet, padding: "2px 8px", fontSize: 12 };

function show(v: FieldValue): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

// Sub-components live at module level on purpose. Declared inside the screen
// they would be a new component type on every render, which remounts the
// input on every keystroke and drops focus.

function DateDetail({ v, calendar }: { v: FieldView; calendar: SourceCalendar | null }) {
  if (v.kind !== "date" || typeof v.value !== "string") return null;
  const be = calendar === "BE";
  if (!be && !v.lowPrecision) return null;
  return (
    <div style={{ fontSize: 12, color: TONE.warn, marginTop: 4, display: "grid", gap: 2 }}>
      <span>
        As printed on the document{be ? " (Buddhist era)" : ""}: <b>{asPrinted(v.value, calendar, v.lowPrecision)}</b>
        {v.lowPrecision ? " — no day given" : ""}
      </span>
      <span>
        {v.lowPrecision ? "Filled in by the system" : "Converted by the system (Gregorian)"}: <b>{v.value}</b>
        {v.lowPrecision ? " (last day of the month)" : ""}
      </span>
    </div>
  );
}

function Meta({ v }: { v: FieldView }) {
  return (
    <span style={{ fontSize: 12, color: TONE.muted }}>{v.page !== null ? `page ${v.page}` : ""}</span>
  );
}

function Editor({
  v,
  draft,
  error,
  busy,
  submitLabel,
  onChange,
  onSubmit,
}: {
  v: FieldView;
  draft: string;
  error: string | undefined;
  busy: boolean;
  submitLabel: string;
  onChange: (raw: string) => void;
  onSubmit: () => void;
}) {
  const common = {
    value: draft,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(e.target.value),
    style: { padding: 6, fontSize: 14, minWidth: 220 } as CSSProperties,
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
      {v.kind === "boolean" ? (
        <select {...common}>
          <option value="true">yes</option>
          <option value="false">no</option>
        </select>
      ) : (
        <input
          {...common}
          type={v.kind === "date" ? "date" : v.kind === "number" ? "number" : "text"}
          step={v.kind === "number" ? "0.01" : undefined}
        />
      )}
      <button type="button" style={btn} disabled={busy} onClick={onSubmit}>
        {submitLabel}
      </button>
      {error && <span style={{ color: TONE.block, fontSize: 12 }}>{error}</span>}
      {NAME_FIELDS.has(v.name) && (
        <span style={{ width: "100%", fontSize: 12, color: TONE.muted }}>
          Edit only if the system misread the page. If the document really spells the name differently from the passport, do not edit it to match: the document has to be reissued.
        </span>
      )}
    </div>
  );
}

export default function ReviewScreen({ initial }: { initial: ReviewDocument }) {
  const [doc, setDoc] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, true>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const x = doc.extracted_json;
  const calendar = x.date_source_calendar;
  const views = useMemo(() => fieldViews(doc), [doc]);
  const required = useMemo(() => requiredFields(x), [x]);
  const done = required.filter((n) => n in doc.confirmations).length;

  // Grouping is by what the reviewer has to do, not by the field's position.
  const batch = views.filter((v) => v.status === "high" && !editing[v.name]);
  const individual = views.filter(
    (v) => v.status === "medium" || v.status === "low" || (v.status === "high" && editing[v.name]),
  );
  const unreadable = views.filter((v) => v.status === "unreadable");
  const confirmed = views.filter((v) => v.status === "confirmed" && !editing[v.name]);
  const reconfirming = views.filter((v) => v.status === "confirmed" && editing[v.name]);
  const absent = views.filter((v) => v.status === "absent");

  async function post(pathname: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          json !== null && typeof json === "object" && "error" in json && typeof json.error === "string"
            ? json.error
            : `Could not save (${res.status})`;
        setError(msg);
        return false;
      }
      setDoc(json as ReviewDocument);
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
    const base = v.confirmedValue !== undefined ? v.confirmedValue : v.value;
    return base === null ? "" : String(base);
  }

  function dropKey(name: string) {
    setEditing(({ [name]: _e, ...rest }) => rest);
    setDrafts(({ [name]: _d, ...rest }) => rest);
    setFieldErrors(({ [name]: _f, ...rest }) => rest);
  }

  async function confirmOne(v: FieldView) {
    const parsed = parseInput(v.name, draftOf(v));
    if (!parsed.ok) {
      setFieldErrors((e) => ({ ...e, [v.name]: parsed.error }));
      return;
    }
    if (await post("confirm", { fields: [{ name: v.name, value: parsed.value }] })) dropKey(v.name);
  }

  /** Confirms the high-confidence fields as they were extracted. Only those:
   *  medium, low and unreadable fields never enter this list. */
  async function confirmBatch() {
    await post("confirm", { fields: batch.map((v) => ({ name: v.name, value: v.value })) });
  }

  async function request(kind: RequestKind, field: string) {
    await post("requests", { kind, field });
  }

  const editor = (v: FieldView, submitLabel: string) => (
    <Editor
      v={v}
      draft={draftOf(v)}
      error={fieldErrors[v.name]}
      busy={busy}
      submitLabel={submitLabel}
      onChange={(raw) => setDrafts((d) => ({ ...d, [v.name]: raw }))}
      onSubmit={() => confirmOne(v)}
    />
  );

  const requestsFor = (name: string) => doc.requests.filter((r) => r.field === name);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <Link href="/" style={{ fontSize: 13, color: TONE.muted }}>← Case {doc.case_id}</Link>
          <h1 style={{ fontSize: 20, margin: "4px 0 0" }}>
            {DOC_TYPE_LABELS[doc.doc_type]}{" "}
            <span style={{ fontSize: 13, color: TONE.muted, fontWeight: 400 }}>{doc.filename}</span>
          </h1>
        </div>
        <div style={{ fontSize: 14, color: doc.confirmed_json ? TONE.pass : TONE.warn }}>
          {doc.confirmed_json ? "Fully confirmed" : `Confirmed ${done} of ${required.length} fields`}
        </div>
      </div>

      <DocTypeBar doc={doc} />

      {x.suspicious_content && (
        <div style={{ ...card, borderLeft: `3px solid ${TONE.block}`, marginTop: 12 }}>
          <b>The document contains text that reads like an instruction.</b> It was recorded and not acted on. Check the image.
          <div style={{ fontSize: 13, color: TONE.muted, marginTop: 4, whiteSpace: "pre-wrap" }}>
            “{x.suspicious_content}”
          </div>
        </div>
      )}

      {calendar === "BE" && (
        <div style={{ ...card, borderLeft: `3px solid ${TONE.warn}`, marginTop: 12 }}>
          This document prints years in the Buddhist era. The system converted them to Gregorian; every date shows the printed value beside the converted one. Compare with the image before confirming.
        </div>
      )}

      {error && <p style={{ color: TONE.block, fontSize: 14 }}>{error}</p>}

      <style>{`
        .review-grid { display: grid; grid-template-columns: 1fr; gap: 20px; margin-top: 12px; }
        .review-image { min-width: 0; }
        .review-image img { width: 100%; max-height: 60vh; object-fit: contain; object-position: top; }
        @media (min-width: 900px) {
          .review-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
          .review-image { position: sticky; top: 16px; align-self: start; max-height: calc(100vh - 32px); overflow-y: auto; }
          .review-image img { max-height: none; }
        }
      `}</style>
      <div className="review-grid">
        <div className="review-image">
          {Array.from({ length: doc.page_count }, (_, n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={n}
              src={`/api/documents/${doc.id}/image?page=${n}`}
              alt={`${DOC_TYPE_LABELS[doc.doc_type]} ${doc.filename} page ${n + 1}`}
              style={{ border: `1px solid ${TONE.line}`, background: "#fff", marginBottom: 8 }}
            />
          ))}
        </div>

        <div>
          {batch.length > 0 && (
            <section>
              <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>High confidence</h2>
              {batch.map((v) => (
                <div key={v.name} style={{ ...card, borderLeft: `3px solid ${TONE.pass}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: TONE.muted }}>{v.label}</span>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Meta v={v} />
                      <button type="button" style={btnSmall} onClick={() => setEditing((e) => ({ ...e, [v.name]: true }))}>
                        edit
                      </button>
                    </span>
                  </div>
                  <div style={{ fontWeight: 600 }}>{show(v.value)}</div>
                  <DateDetail v={v} calendar={calendar} />
                </div>
              ))}
              {/* Batch confirmation covers exactly the high-confidence fields
                  listed above. There is intentionally no button that confirms
                  the whole document. */}
              <button type="button" style={{ ...btn, marginBottom: 16 }} disabled={busy} onClick={confirmBatch}>
                Confirm these {batch.length} high-confidence fields as read
              </button>
            </section>
          )}

          {(individual.length > 0 || reconfirming.length > 0) && (
            <section>
              <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>Confirm one at a time</h2>
              {[...individual, ...reconfirming].map((v) => {
                const tone = v.status === "low" ? TONE.block : TONE.warn;
                const badge =
                  v.status === "low"
                    ? "low confidence"
                    : v.status === "medium"
                      ? "medium confidence"
                      : v.status === "confirmed"
                        ? "editing a confirmed value"
                        : "editing a high-confidence value";
                return (
                  <div key={v.name} style={{ ...card, borderLeft: `4px solid ${tone}`, background: v.status === "low" ? "#FBF3F2" : "#FCF7EE" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: TONE.muted }}>{v.label}</span>
                      <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: tone, fontWeight: 600 }}>{badge}</span>
                        <Meta v={v} />
                        {editing[v.name] && (
                          <button type="button" style={btnSmall} onClick={() => dropKey(v.name)}>
                            cancel
                          </button>
                        )}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: TONE.muted }}>System read: {show(v.value)}</div>
                    <DateDetail v={v} calendar={calendar} />
                    {editor(v, "Confirm this field")}
                  </div>
                );
              })}
            </section>
          )}

          {unreadable.length > 0 && (
            <section>
              <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>Unreadable</h2>
              {unreadable.map((v) => (
                <div key={v.name} style={{ ...card, border: `2px dashed ${TONE.block}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: TONE.muted }}>{v.label}</span>
                    <span style={{ fontSize: 12, color: TONE.block, fontWeight: 600 }}>could not be read</span>
                  </div>
                  <div style={{ fontSize: 12, color: TONE.muted }}>
                    If you can read it from the image, type the value. If the photo is unclear, request a new photo. If the document itself is missing or damaged, request a new document.
                  </div>
                  {editor(v, "Confirm typed value")}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button type="button" style={btnQuiet} disabled={busy} onClick={() => request("new_photo", v.name)}>
                      Request a new photo
                    </button>
                    <button type="button" style={btnQuiet} disabled={busy} onClick={() => request("new_document", v.name)}>
                      Request a new document
                    </button>
                  </div>
                  {requestsFor(v.name).map((r) => (
                    <div key={r.created_at} style={{ fontSize: 12, color: TONE.warn, marginTop: 4 }}>
                      Recorded “{REQUEST_LABEL[r.kind]}” at {new Date(r.created_at).toLocaleString("en-GB")} — not yet sent to the student; a person has to contact them.
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          {confirmed.length > 0 && (
            <section>
              <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>Confirmed</h2>
              {confirmed.map((v) => (
                <div key={v.name} style={{ ...card, borderLeft: `3px solid ${TONE.pass}`, opacity: 0.8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: TONE.muted }}>{v.label}</span>
                    <button type="button" style={btnSmall} onClick={() => setEditing((e) => ({ ...e, [v.name]: true }))}>
                      edit
                    </button>
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    ✓ {show(v.confirmedValue ?? null)}
                    {v.confirmedValue !== v.value && (
                      <span style={{ fontSize: 12, color: TONE.muted, fontWeight: 400 }}>
                        {" "}(system read {show(v.value)})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          {absent.length > 0 && (
            <p style={{ fontSize: 12, color: TONE.muted }}>
              Not on the document: {absent.map((v) => v.label).join(", ")}
            </p>
          )}

          {doc.confirmed_json && (
            <div style={{ ...card, borderLeft: `3px solid ${TONE.pass}` }}>
              All fields confirmed at {new Date(doc.confirmed_json.confirmed_at).toLocaleString("en-GB")}{" "}
              <Link href={`/case?case_id=${encodeURIComponent(doc.case_id)}`}>Check the whole case →</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
