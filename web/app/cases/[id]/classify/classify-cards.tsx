"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfidenceBadge } from "../../../components/badges";
import { Icon } from "../../../components/icons";
import { ConfirmationDialog, errorOf, useToast } from "../../../components/ui";
import { DOC_TYPE_LABELS } from "../../../lib/review";
import { DOC_TYPES, type DocType, type ReviewDocument, type UploadRecord } from "../../../types";

function Thumbs({ n, flag = false }: { n: number; flag?: boolean }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      {Array.from({ length: Math.min(n, 3) }, (_, i) => (
        <div key={i} className={`thumb${flag && i === 0 ? " flag" : ""}`} style={i > 0 ? { marginLeft: -8 } : undefined}>
          <i />
          <i style={{ width: "70%" }} />
          <i />
          <i style={{ width: "50%" }} />
        </div>
      ))}
    </div>
  );
}

/** A group of pages the sorter would not extract on its own. A person picks the type. */
function HeldCard({ upload, onDone }: { upload: UploadRecord; onDone: (doc: ReviewDocument | null) => void }) {
  const toast = useToast();
  const guess = upload.suggested_type;
  const [docType, setDocType] = useState<DocType | "">(guess === "other" ? "" : guess);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = upload.pages[0]?.classification;

  async function extract() {
    if (!docType) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/uploads/${upload.id}/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc_type: docType }) });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorOf(body, res.status, "Could not read the pages"));
        return;
      }
      toast("ok", `Read as ${DOC_TYPE_LABELS[docType]}`);
      onDone(body as ReviewDocument);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/uploads/${upload.id}/dismiss`, { method: "POST" });
      if (!res.ok) {
        setError(errorOf(await res.json().catch(() => null), res.status, "Could not dismiss"));
        return;
      }
      toast("info", "Marked as not a required document");
      onDone(null);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card compact stripe warn">
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <Thumbs n={upload.pages.length} flag />
        <div style={{ minWidth: 0 }}>
          <div className="label">Detected{upload.pages.length > 1 ? ` · ${upload.pages.length} pages grouped` : ""}</div>
          <div className="value" style={{ fontSize: 15 }}>{guess === "other" ? "Not one of the required types" : `${DOC_TYPE_LABELS[guess]}?`}</div>
          {/* For "other" the classifier's confidence is about it NOT being a known type; a band would read as confidence in a type. */}
          <div style={{ marginTop: 4 }}>{first && guess !== "other" && <ConfidenceBadge band={first.confidence} />}</div>
          <div className="muted small" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
            {upload.pages.map((p) => p.filename).join(" + ")}
            {first?.reason ? ` · ${first.reason}` : ""}
          </div>
          <div className="row small" style={{ color: "var(--warning-text)", marginTop: 6 }}>
            <Icon name="tri" size={13} />
            Please confirm this document type.{upload.held_reason ? ` ${upload.held_reason}.` : ""}
          </div>
        </div>
      </div>
      <div className="row wrap" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <select className="select" style={{ height: 36, minWidth: 200, borderColor: docType ? undefined : "var(--warning)" }} value={docType} onChange={(e) => setDocType(e.target.value as DocType | "")} aria-label="Document type" disabled={busy}>
          <option value="">Select type…</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <span className="row">
          <button type="button" className="btn secondary sm" onClick={dismiss} disabled={busy} title="Keep the pages on file but do not read them as one of the four required documents">
            Not a required document
          </button>
          <button type="button" className="btn primary sm" onClick={extract} disabled={!docType || busy}>
            {busy ? "Reading…" : "Confirm and read"}
          </button>
        </span>
      </div>
      {error && <div className="alert" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/** A document the sorter was confident about. The type can still be changed; that re-reads the pages. */
function DocCard({ doc, caseId }: { doc: ReviewDocument; caseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [docType, setDocType] = useState<DocType>(doc.doc_type);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = doc.classification;

  async function retype() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/retype`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc_type: docType }) });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorOf(body, res.status, "Could not re-read the pages"));
        return;
      }
      setConfirming(false);
      toast("ok", `Re-read as ${DOC_TYPE_LABELS[docType]}`);
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card compact">
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <Thumbs n={doc.page_count} />
        <div style={{ minWidth: 0 }}>
          <div className="label">{c ? "Detected" : "Chosen by a person"}{doc.page_count > 1 ? ` · ${doc.page_count} pages grouped` : ""}</div>
          <div className="value" style={{ fontSize: 15 }}>{DOC_TYPE_LABELS[doc.doc_type]}</div>
          <div style={{ marginTop: 4 }}>{c && <ConfidenceBadge band={c.confidence} />}</div>
          <div className="muted small" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
            {doc.filename}
            {c?.reason ? ` · ${c.reason}` : ""}
          </div>
        </div>
      </div>
      <div className="row wrap" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <select className="select" style={{ height: 36, minWidth: 200 }} value={docType} onChange={(e) => setDocType(e.target.value as DocType)} aria-label="Document type">
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <span className="row">
          {docType !== doc.doc_type ? (
            <button type="button" className="btn secondary sm" onClick={() => setConfirming(true)}>
              Change type
            </button>
          ) : (
            <Link href={`/cases/${encodeURIComponent(caseId)}/review/${doc.id}`} className="btn primary sm">
              {doc.confirmed_json ? "Open" : "Review fields"}
            </Link>
          )}
        </span>
      </div>
      {error && <div className="alert" style={{ marginTop: 8 }}>{error}</div>}
      <ConfirmationDialog
        open={confirming}
        title={`Re-read these pages as ${DOC_TYPE_LABELS[docType]}?`}
        body={`The same ${doc.page_count === 1 ? "page" : "pages"} will be extracted again under the new type as a new document. Confirmations made under "${DOC_TYPE_LABELS[doc.doc_type]}" do not carry over.`}
        confirmLabel="Re-read pages"
        busy={busy}
        onConfirm={retype}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

export function ClassifyCards({ caseId, docs, held }: { caseId: string; docs: ReviewDocument[]; held: UploadRecord[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, ReviewDocument | null>>({});
  const remaining = held.filter((u) => !(u.id in done));
  const all = [...docs, ...Object.values(done).filter((d): d is ReviewDocument => d !== null)];

  return (
    <div className="grid-2">
      {remaining.map((u) => (
        <HeldCard
          key={u.id}
          upload={u}
          onDone={(d) => {
            setDone((m) => ({ ...m, [u.id]: d }));
            router.refresh();
          }}
        />
      ))}
      {all.map((d) => (
        <DocCard key={d.id} doc={d} caseId={caseId} />
      ))}
      {all.length === 0 && remaining.length === 0 && (
        <div className="muted" style={{ gridColumn: "1 / -1" }}>
          No documents on this case yet. <Link href="/cases/new">Upload files</Link>.
        </div>
      )}
    </div>
  );
}
