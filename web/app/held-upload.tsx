"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DOC_TYPE_LABELS } from "./lib/review";
import { DOC_TYPES, type DocType, type ReviewDocument, type UploadRecord } from "./types";

const TONE = { block: "#933731", warn: "#9C6410", muted: "#7C8D95", ink: "#17272E" };

/** A group of pages the sorter would not extract on its own. A person picks the type. */
export default function HeldUpload({ upload }: { upload: UploadRecord }) {
  const router = useRouter();
  const guess = upload.suggested_type === "other" ? "transcript" : upload.suggested_type;
  const [docType, setDocType] = useState<DocType>(guess);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function extract() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/uploads/${upload.id}/extract`, {
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

  const first = upload.pages[0];
  return (
    <li style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderTop: `1px dashed ${TONE.warn}`, fontSize: 14, flexWrap: "wrap" }}>
      <span style={{ width: 150, color: TONE.warn, fontWeight: 600 }}>Needs a type</span>
      <span style={{ flex: 1, color: TONE.muted, minWidth: 200 }}>
        {upload.pages.map((p) => p.filename).join(" + ")}
        <br />
        <span style={{ fontSize: 12 }}>
          {upload.held_reason ?? ""}
          {first.classification.reason ? ` — ${first.classification.reason}` : ""}
        </span>
      </span>
      <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} style={{ padding: 4 }}>
        {DOC_TYPES.map((t) => (
          <option key={t} value={t}>
            {DOC_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <button type="button" onClick={extract} disabled={busy} style={{ padding: "4px 10px", color: "#fff", background: TONE.ink, border: 0, borderRadius: 4 }}>
        {busy ? "Reading…" : "Read as this type"}
      </button>
      {error && <span style={{ color: TONE.block, width: "100%", fontSize: 12 }}>{error}</span>}
    </li>
  );
}
