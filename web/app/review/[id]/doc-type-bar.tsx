"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DOC_TYPE_LABELS } from "../../lib/review";
import { DOC_TYPES, type DocType, type ReviewDocument } from "../../types";

const TONE = { block: "#933731", warn: "#9C6410", muted: "#7C8D95", line: "#D8DEDC", ink: "#17272E" };

/**
 * Shows how the document's type was decided and lets the reviewer change it.
 * Changing it re-extracts the same pages under the new type as a new
 * document; nothing on this one is edited.
 */
export default function DocTypeBar({ doc }: { doc: ReviewDocument }) {
  const router = useRouter();
  const [docType, setDocType] = useState<DocType>(doc.doc_type);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retype() {
    if (docType === doc.doc_type) return;
    if (!confirm(`Re-read these pages as ${DOC_TYPE_LABELS[docType]}? Confirmations made under the current type will not carry over.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/retype`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_type: docType }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        setError(
          body !== null && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : `Failed (${res.status})`,
        );
        return;
      }
      router.push(`/review/${(body as ReviewDocument).id}`);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  const c = doc.classification;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, marginTop: 8, padding: "8px 12px", background: "#fff", border: `1px solid ${TONE.line}`, borderRadius: 6 }}>
      <span style={{ color: TONE.muted }}>
        Type:{" "}
        {c ? (
          <>
            assigned by the system (
            <b style={{ color: c.confidence === "high" ? TONE.ink : TONE.warn }}>{c.confidence} confidence</b>
            {c.reason ? `, ${c.reason}` : ""})
          </>
        ) : (
          "chosen by a person"
        )}
      </span>
      <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} style={{ padding: 4 }}>
        {DOC_TYPES.map((t) => (
          <option key={t} value={t}>
            {DOC_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={retype}
        disabled={busy || docType === doc.doc_type}
        style={{ padding: "4px 10px", border: `1px solid ${TONE.ink}`, background: "transparent", borderRadius: 4 }}
      >
        {busy ? "Re-reading…" : "Wrong type, re-read"}
      </button>
      {error && <span style={{ color: TONE.block }}>{error}</span>}
    </div>
  );
}
