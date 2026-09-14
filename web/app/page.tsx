import Link from "next/link";

import HeldUpload from "./held-upload";
import { DOC_TYPE_LABELS, requiredFields } from "./lib/review";
import { listDocuments, listUploads } from "./lib/store";
import UploadForm from "./upload-form";
import type { ReviewDocument, UploadRecord } from "./types";

export const dynamic = "force-dynamic";

const TONE = { pass: "#2F6B4F", warn: "#9C6410", muted: "#7C8D95", line: "#D8DEDC" };

function progress(doc: ReviewDocument): { done: number; total: number } {
  const required = requiredFields(doc.extracted_json);
  const done = Object.keys(doc.confirmations).filter((k) => required.includes(k)).length;
  return { done, total: required.length };
}

export default async function Page() {
  const [docs, uploads] = await Promise.all([listDocuments(), listUploads()]);
  const held = uploads.filter((u) => u.status === "held");

  const byCase = new Map<string, { docs: ReviewDocument[]; held: UploadRecord[] }>();
  const bucket = (id: string) => {
    const b = byCase.get(id) ?? { docs: [], held: [] };
    byCase.set(id, b);
    return b;
  };
  for (const d of docs) bucket(d.case_id).docs.push(d);
  for (const u of held) bucket(u.case_id).held.push(u);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Pre-submission document check</h1>
      <p style={{ color: TONE.muted, fontSize: 14, marginTop: 0 }}>
        Upload every document for a case at once. The system sorts and reads them; a reviewer confirms each field before the case is checked for consistency.
      </p>

      <UploadForm />

      {byCase.size === 0 && <p style={{ color: TONE.muted, fontSize: 14 }}>No documents yet</p>}

      {[...byCase.entries()].map(([caseId, { docs: caseDocs, held: caseHeld }]) => (
        <section
          key={caseId}
          style={{ background: "#fff", border: `1px solid ${TONE.line}`, borderRadius: 6, padding: 16, marginTop: 16 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Case {caseId}</h2>
            <Link href={`/case?case_id=${encodeURIComponent(caseId)}`} style={{ fontSize: 14 }}>
              Check the whole case →
            </Link>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {caseHeld.map((u) => (
              <HeldUpload key={u.id} upload={u} />
            ))}
            {caseDocs.map((d) => {
              const { done, total } = progress(d);
              const confirmed = d.confirmed_json !== null;
              return (
                <li
                  key={d.id}
                  style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${TONE.line}`, fontSize: 14 }}
                >
                  <span style={{ width: 150, fontWeight: 600 }}>{DOC_TYPE_LABELS[d.doc_type]}</span>
                  <span style={{ flex: 1, color: TONE.muted }}>
                    {d.filename}
                    {d.page_count > 1 ? ` (${d.page_count} pages)` : ""}
                    {d.classification && (
                      <span style={{ fontSize: 12 }}>
                        {" "}· type assigned by the system, {d.classification.confidence} confidence
                      </span>
                    )}
                  </span>
                  <span style={{ color: confirmed ? TONE.pass : TONE.warn }}>
                    {confirmed ? "Fully confirmed" : `${done}/${total} confirmed`}
                  </span>
                  <Link href={`/review/${d.id}`}>Review →</Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
