"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { DOC_TYPE_LABELS } from "./lib/review";
import { DOC_TYPES, type ReviewDocument, type UploadRecord } from "./types";

const TONE = { block: "#933731", pass: "#2F6B4F", muted: "#7C8D95", line: "#D8DEDC", ink: "#17272E" };

function errorOf(body: unknown, status: number): string {
  return body !== null && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : `Upload failed (${status})`;
}

/**
 * One form, two routes. With the type left on "detect automatically", every
 * file goes through the sorter and comes back as separate documents plus
 * anything the sorter held for a person. With a type chosen, all files are
 * the pages of that one document.
 */
export default function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSummary(null);
    const form = new FormData(e.currentTarget);
    const auto = form.get("doc_type") === "auto";
    try {
      const res = await fetch(auto ? "/api/documents/batch" : "/api/documents", { method: "POST", body: form });
      const body: unknown = await res.json();
      if (!res.ok) {
        setError(errorOf(body, res.status));
        return;
      }
      if (auto) {
        const r = body as { uploads: UploadRecord[]; documents: ReviewDocument[] };
        const held = r.uploads.filter((u) => u.status === "held").length;
        setSummary(
          `Sorted ${r.documents.length} document${r.documents.length === 1 ? "" : "s"}` +
            (held ? `; ${held} file${held === 1 ? "" : "s"} need a person to pick the type (see below)` : ""),
        );
        router.refresh();
      } else {
        router.push(`/review/${(body as ReviewDocument).id}`);
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", background: "#fff", border: `1px solid ${TONE.line}`, borderRadius: 6, padding: 16, fontSize: 14 }}
    >
      <label style={{ display: "grid", gap: 4 }}>
        <span>Case id</span>
        <input name="case_id" required pattern="[A-Za-z0-9-]{1,40}" placeholder="STU-2026-0413" style={{ padding: 6 }} />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Document type</span>
        <select name="doc_type" defaultValue="auto" style={{ padding: 6 }}>
          <option value="auto">Detect automatically (any number of files)</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABELS[t]} (all files are pages of this document)
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Files (PNG/JPEG/HEIC/PDF, multiple allowed)</span>
        <input name="files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf" required />
      </label>
      <button type="submit" disabled={busy} style={{ padding: "7px 14px", color: "#fff", background: TONE.ink, border: 0, borderRadius: 4 }}>
        {busy ? "Reading documents…" : "Upload and read"}
      </button>
      {error && <span style={{ color: TONE.block, width: "100%" }}>{error}</span>}
      {summary && <span style={{ color: TONE.pass, width: "100%" }}>{summary}</span>}
      <span style={{ color: TONE.muted, fontSize: 12, width: "100%" }}>
        The system can tell what each page is, but every field it reads still has to be confirmed by a person.
      </span>
    </form>
  );
}
