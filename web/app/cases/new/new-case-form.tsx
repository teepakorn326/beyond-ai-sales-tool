"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { ConfidenceBadge, Pill } from "../../components/badges";
import { Icon } from "../../components/icons";
import { errorOf, useToast } from "../../components/ui";
import { DOC_TYPE_LABELS } from "../../lib/review";
import { fmtSize } from "../../lib/format";
import type { ReviewDocument, UploadRecord } from "../../types";

const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf";
const MAX = 5 * 1024 * 1024;

interface Picked {
  key: string;
  file: File;
  preview: string | null;
  problem: string | null;
}

interface Sorted {
  filename: string;
  type: string;
  band: "high" | "medium" | "low" | null;
  pages: number;
  held: boolean;
  reason: string | null;
}

function isImage(f: File): boolean {
  return f.type === "image/png" || f.type === "image/jpeg" || f.type === "image/webp";
}

export function NewCaseForm({ initialCaseId = "" }: { initialCaseId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [caseId, setCaseId] = useState(initialCaseId);
  const [intake, setIntake] = useState("");
  const [target, setTarget] = useState("");
  const [courseEnd, setCourseEnd] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sorted, setSorted] = useState<Sorted[] | null>(null);

  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files]);

  const idOk = /^[A-Za-z0-9-]{1,40}$/.test(caseId);
  const problems = files.filter((f) => f.problem).length;
  const canSubmit = idOk && files.length > 0 && problems === 0 && !busy;

  function add(list: FileList | File[]) {
    const next: Picked[] = [...list].map((file) => ({
      key: `${file.name}:${file.size}:${file.lastModified}`,
      file,
      preview: isImage(file) ? URL.createObjectURL(file) : null,
      problem: !ACCEPT.split(",").includes(file.type) ? "Only PDF, JPG, PNG, WebP or HEIC" : file.size > MAX ? "Larger than 5 MB" : null,
    }));
    setFiles((cur) => {
      const seen = new Set(cur.map((f) => f.key));
      return [...cur, ...next.filter((f) => !seen.has(f.key))];
    });
    setSorted(null);
  }

  function remove(key: string) {
    setFiles((cur) => cur.filter((f) => f.key !== key));
    toast("info", "Upload removed");
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) add(e.dataTransfer.files);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, intake: intake || null, submission_target: target || null, course_end_date: courseEnd || null }),
      });
      if (!meta.ok) {
        setError(errorOf(await meta.json().catch(() => null), meta.status, "Could not save the case"));
        return;
      }
      const form = new FormData();
      form.set("case_id", caseId);
      for (const f of files) form.append("files", f.file, f.file.name);
      const res = await fetch("/api/documents/batch", { method: "POST", body: form });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorOf(body, res.status, "Upload failed"));
        return;
      }
      const r = body as { uploads: UploadRecord[]; documents: ReviewDocument[] };
      const rows: Sorted[] = r.uploads.map((u) => {
        const first = u.pages[0]?.classification;
        return {
          filename: u.pages.map((p) => p.filename).join(" + "),
          type: u.suggested_type === "other" ? "Needs classification" : DOC_TYPE_LABELS[u.suggested_type],
          band: first?.confidence ?? null,
          pages: u.pages.length,
          held: u.status === "held",
          reason: u.held_reason,
        };
      });
      setSorted(rows);
      const held = rows.filter((x) => x.held).length;
      toast("ok", `Sorted ${r.documents.length} document${r.documents.length === 1 ? "" : "s"}${held ? `, ${held} to classify by hand` : ""}`);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  const summary = useMemo(() => `${files.length} file${files.length === 1 ? "" : "s"} · ${fmtSize(files.reduce((n, f) => n + f.file.size, 0))}`, [files]);

  return (
    <>
      <div className="grid-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <label className="card compact" style={{ display: "block" }}>
          <span className="label">Case ID</span>
          <input className={`input sm${caseId && !idOk ? " error" : ""}`} value={caseId} onChange={(e) => setCaseId(e.target.value.trim())} placeholder="e.g. 0413" style={{ marginTop: 4 }} />
          {caseId && !idOk && <span className="small" style={{ color: "var(--error-text)" }}>Letters, digits and dashes only</span>}
        </label>
        <label className="card compact" style={{ display: "block" }}>
          <span className="label">Intake</span>
          <input className="input sm" type="month" value={intake} onChange={(e) => setIntake(e.target.value)} style={{ marginTop: 4 }} />
        </label>
        <label className="card compact" style={{ display: "block" }}>
          <span className="label">Submission target</span>
          <input className="input sm" type="date" value={target} onChange={(e) => setTarget(e.target.value)} style={{ marginTop: 4 }} />
          <span className="muted small">Used by the English test validity check</span>
        </label>
        <label className="card compact" style={{ display: "block" }}>
          <span className="label">Course end date</span>
          <input className="input sm" type="date" value={courseEnd} onChange={(e) => setCourseEnd(e.target.value)} style={{ marginTop: 4 }} />
          <span className="muted small">Used by the passport validity check</span>
        </label>
      </div>

      <div
        className={`dropzone${over ? " over" : ""}${files.length ? " slim" : ""}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        <div>
          <div style={{ fontSize: files.length ? 14 : 16, fontWeight: 600 }}>{files.length ? "Add more documents" : "Drop student documents here"}</div>
          {!files.length && <div className="t2" style={{ maxWidth: "52ch" }}>Upload passports, transcripts, degree certificates, English test results and supporting documents.</div>}
        </div>
        <span className="btn primary" style={{ marginTop: files.length ? 0 : 10 }}>
          Choose files
        </span>
        {!files.length && <div className="muted small" style={{ marginTop: 6 }}>PDF · JPG · PNG · WebP · HEIC · up to 5 MB each</div>}
        <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && add(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="overline">Selected · {summary}</span>
            <span className="row">
              <button type="button" className="btn secondary" onClick={() => (setFiles([]), setSorted(null))} disabled={busy}>
                Clear
              </button>
              <button type="button" className="btn primary" onClick={submit} disabled={!canSubmit}>
                {busy ? "Uploading and sorting…" : "Upload and sort"}
              </button>
            </span>
          </div>
          {!idOk && <div className="muted small">Enter a case ID to upload.</div>}
          {files.map((f, i) => {
            const s = sorted?.[i];
            return (
              <div key={f.key} className={`card compact${f.problem || s?.held ? " stripe warn" : ""}`}>
                <div className="row" style={{ gap: 14 }}>
                  <div className={`thumb${f.preview ? " img" : ""}`}>
                    {f.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.preview} alt="" />
                    ) : (
                      <>
                        <i />
                        <i style={{ width: "70%" }} />
                        <i />
                      </>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="value" style={{ overflowWrap: "anywhere" }}>{f.file.name}</div>
                    <div className="muted small">
                      {fmtSize(f.file.size)}
                      {s ? ` · ${s.pages} page${s.pages === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                  {f.problem ? (
                    <Pill tone="err" icon="block">
                      {f.problem}
                    </Pill>
                  ) : busy ? (
                    <Pill tone="info" icon="dotted">
                      Processing
                    </Pill>
                  ) : s ? (
                    <Pill tone="ok" icon="check">
                      Processed
                    </Pill>
                  ) : (
                    <Pill tone="neutral" icon="dotted">
                      Ready to upload
                    </Pill>
                  )}
                  {s && <span style={{ width: 160 }}>{s.type}</span>}
                  {s?.band && <ConfidenceBadge band={s.band} />}
                  {!sorted && (
                    <button type="button" className="icbtn sm" onClick={() => remove(f.key)} aria-label={`Remove ${f.file.name}`} disabled={busy}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
                {s?.held && (
                  <div className="row small" style={{ marginTop: 8, color: "var(--warning-text)" }}>
                    <Icon name="tri" size={13} />
                    Confirm this document&apos;s type in the next step.{s.reason ? ` ${s.reason}.` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      {sorted && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Link href={`/cases/${encodeURIComponent(caseId)}/classify`} className="btn primary lg">
            Continue to classify
            <Icon name="chev" size={14} />
          </Link>
        </div>
      )}
      {sorted && (
        <button type="button" hidden onClick={() => router.refresh()} />
      )}
    </>
  );
}
