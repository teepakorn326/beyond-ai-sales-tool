"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, FileText, Info, Mail, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ConfidenceBadge, Pill, ProvenanceChip } from "../../../../components/badges";
import { Hint } from "../../../../components/hint";
import { TopBar } from "../../../../components/shell";
import { ConfirmationDialog, errorOf, useToast } from "../../../../components/ui";
import { caseLabel, fmtDate } from "../../../../lib/format";
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

const STRIPE = {
  err: "border-l-2 border-l-(--error)",
  warn: "border-l-2 border-l-(--warning)",
  info: "border-l-2 border-l-(--primary)",
  ok: "border-l-2 border-l-(--success)",
} as const;

// Sub-components live at module level so an input keeps focus across renders.

/** One line under a date: what the page printed, when that differs from the stored value. */
function DateNote({ v, calendar }: { v: FieldView; calendar: SourceCalendar | null }) {
  if (v.kind !== "date" || typeof v.value !== "string") return null;
  const be = calendar === "BE";
  if (!be && !v.lowPrecision) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-(--info-text)">
      <Info className="size-3.5" />
      Printed as <span className="font-mono">{asPrinted(v.value, calendar, v.lowPrecision)}</span>
      <Hint text={[be ? "Buddhist Era year, converted by the system." : null, v.lowPrecision ? "The page gives no day, so the system filled in the last day of the month." : null].filter(Boolean).join(" ")} />
    </div>
  );
}

function Editor({ v, draft, error, busy, submitLabel, focus = false, onChange, onSubmit, onCancel }: { v: FieldView; draft: string; error: string | undefined; busy: boolean; submitLabel: string; focus?: boolean; onChange: (raw: string) => void; onSubmit: () => void; onCancel?: () => void }) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSubmit();
    if (e.key === "Escape" && onCancel) onCancel();
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      {v.kind === "boolean" ? (
        <Select value={draft || "true"} items={{ true: "Present", false: "Not present" }} disabled={busy} onValueChange={(val) => onChange(String(val))}>
          <SelectTrigger className="w-full font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Present</SelectItem>
            <SelectItem value="false">Not present</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={`input-${v.name}`}
          value={draft}
          disabled={busy}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={error ? true : undefined}
          className="font-semibold"
          type={v.kind === "date" ? "date" : v.kind === "number" ? "number" : "text"}
          step={v.kind === "number" ? "0.01" : undefined}
          placeholder={v.kind === "date" ? "Gregorian date" : "As printed"}
          title="Enter saves, Esc cancels"
          autoFocus={focus}
        />
      )}
      {error && <span className="text-xs text-(--error-text)">{error}</span>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={onSubmit}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {NAME_FIELDS.has(v.name) && <span className="text-xs text-(--warning-text)">Fix misreads only. A genuinely different spelling means the document must be reissued.</span>}
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
  const startEdit = (name: string) => setEditing((e) => ({ ...e, [name]: true }));
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
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => goPage(v.page)}>
        p.{v.page}
      </Button>
    ) : null;

  const band = (v: FieldView) => (v.status === "confirmed" ? (v.confidence ?? "low") : v.status === "unreadable" ? "unreadable" : v.status === "absent" ? "low" : v.status);

  /** The two ways out when the image cannot be read. Hidden behind one button so the common path stays two buttons. */
  const cantRead = (name: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={busy} />}>Can&apos;t read it?</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => request("new_photo", name)}>
          <Camera />
          Request a new photo
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setRequestDoc(name)}>
          <FileText />
          Request a new document
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const requested = (name: string) =>
    requestsFor(name).map((r) => (
      <div key={r.created_at} className="mt-2 flex items-center gap-1.5 text-xs text-(--warning-text)">
        <Mail className="size-3" />
        {r.kind === "new_photo" ? "New photo" : "New document"} requested {fmtDate(r.created_at.slice(0, 10))}
        <Hint text="Nothing is sent from here. A person contacts the student; the request stays on the case until a new copy arrives." />
      </div>
    ));

  const IndividualCard = ({ v, tone }: { v: FieldView; tone: "warn" | "err" | "info" }) => {
    const isEdit = !!editing[v.name];
    const wasConfirmed = v.status === "confirmed";
    return (
      <div id={`field-${v.name}`} className={cn("rounded-lg border bg-card px-3.5 py-3", STRIPE[tone])}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{v.label}</span>
          {wasConfirmed && <ProvenanceChip kind={v.confirmedValue !== v.value ? "edited" : "confirmed"} />}
        </div>
        {!isEdit && <div className="text-[15px] font-semibold break-words">{show(v.value, v.kind)}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <ConfidenceBadge band={band(v)} />
          {pageLink(v)}
        </div>
        {!isEdit && <DateNote v={v} calendar={calendar} />}
        {isEdit ? (
          <Editor v={v} draft={draftOf(v)} error={fieldErrors[v.name]} busy={busy} submitLabel="Save" focus onChange={(raw) => setDrafts((d) => ({ ...d, [v.name]: raw }))} onSubmit={() => confirmOne(v)} onCancel={() => dropKey(v.name)} />
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => confirmOne(v, v.value)}>
              {v.kind === "date" && (calendar === "BE" || v.lowPrecision) ? "Confirm conversion" : "Confirm"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => startEdit(v.name)}>
              Edit
            </Button>
            {v.status === "low" && cantRead(v.name)}
          </div>
        )}
        {requested(v.name)}
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
              <Link href={`${base}/review/${prev.docId}`} className={cn(buttonVariants({ variant: "outline" }))}>
                <ChevronLeft />
                {prev.label}
              </Link>
            )}
            {next && (
              <Link href={`${base}/review/${next.docId}`} className={cn(buttonVariants({ variant: "outline" }))}>
                {next.label}
                <ChevronRight />
              </Link>
            )}
            <Link href={base} className={cn(buttonVariants(), !allReviewed && "pointer-events-none opacity-50")} aria-disabled={!allReviewed} title={allReviewed ? undefined : "Every field on every document must be confirmed first"}>
              Finish review
            </Link>
          </>
        }
      />
      <main className="content" style={{ gap: 16 }}>
        <Tabs value={doc.id} onValueChange={(v) => router.push(`${base}/review/${String(v)}`)}>
          <TabsList variant="line" className="h-10 border-b">
            {tabs.map((t) => {
              const cur = t.docId === doc.id;
              const reviewed = cur ? doc.confirmed_json !== null : t.reviewed;
              const left = cur ? required.length - done : t.left;
              return (
                <TabsTrigger key={t.docId} value={t.docId} className="px-3">
                  {reviewed && <Check className="text-(--success)" />}
                  {t.label}
                  {!reviewed && (
                    <Badge variant="secondary" className="ml-0.5">
                      {left} left
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="split-review">
          <DocumentViewer docId={doc.id} label={DOC_TYPE_LABELS[doc.doc_type]} pageCount={doc.page_count} page={page} onPage={setPage} flaggedPages={flagged} />

          <div className="review-panel flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base font-semibold">{DOC_TYPE_LABELS[doc.doc_type]}</h2>
              {doc.confirmed_json ? (
                <Pill tone="ok" icon={Check}>
                  Confirmed
                </Pill>
              ) : (
                <span className="text-muted-foreground">
                  {done} of {required.length} confirmed
                </span>
              )}
              {doc.classification && <Hint text={`Detected as ${DOC_TYPE_LABELS[doc.doc_type].toLowerCase()} with ${doc.classification.confidence} confidence${doc.classification.reason ? `: ${doc.classification.reason}` : ""}`} />}
              <span className="flex-1" />
              <Link href={`${base}/classify`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Change type
              </Link>
            </div>

            {error && <div className="rounded-lg border border-(--error) bg-(--error-soft) px-3 py-2 text-(--error-text)">{error}</div>}

            {batch.length > 0 && (
              <div className="rounded-lg border bg-muted px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <ConfidenceBadge band="high" />
                    <span className="text-muted-foreground">
                      {batch.length} field{batch.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  {/* The only batch action in the product. Medium, low and unreadable fields never enter it. */}
                  <Button size="sm" disabled={busy} onClick={confirmBatch}>
                    Confirm {batch.length} field{batch.length === 1 ? "" : "s"}
                  </Button>
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {batch.map((v) => (
                    <div key={v.name} id={`field-${v.name}`} className="rounded-lg border bg-card px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{v.label}</span>
                        <Button variant="ghost" size="icon-xs" aria-label={`Edit ${v.label}`} onClick={() => startEdit(v.name)}>
                          <Pencil />
                        </Button>
                      </div>
                      <div className="text-[13px] font-semibold break-words">{show(v.value, v.kind)}</div>
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
              <div key={v.name} id={`field-${v.name}`} className={cn("rounded-lg border bg-card px-3.5 py-3", STRIPE.err)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{v.label}</span>
                  <Hint text="Type the value if you can read it from the image. Otherwise request a new photo, or a new document if the page itself is damaged." />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <ConfidenceBadge band="unreadable" />
                  {pageLink(v)}
                </div>
                <Editor v={v} draft={draftOf(v)} error={fieldErrors[v.name]} busy={busy} submitLabel="Save typed value" onChange={(raw) => setDrafts((d) => ({ ...d, [v.name]: raw }))} onSubmit={() => confirmOne(v)} />
                <div className="mt-2">{cantRead(v.name)}</div>
                {requested(v.name)}
              </div>
            ))}

            {confirmed.map((v) => {
              const edited = v.confirmedValue !== v.value;
              return (
                <div key={v.name} id={`field-${v.name}`} className={cn("flex flex-wrap items-center gap-2.5 rounded-lg border bg-card px-3.5 py-2", edited ? STRIPE.info : STRIPE.ok)}>
                  <Check className="size-4 text-(--success)" />
                  <span className="w-[140px] text-xs font-medium text-muted-foreground">{v.label}</span>
                  <span className="font-semibold break-words">{show(v.confirmedValue ?? null, v.kind)}</span>
                  <span className="flex-1" />
                  {edited && <ProvenanceChip kind="edited" />}
                  <Button variant="ghost" size="icon-xs" aria-label={`Edit ${v.label}`} onClick={() => startEdit(v.name)}>
                    <Pencil />
                  </Button>
                  {edited && <div className="w-full pl-[166px] text-xs text-muted-foreground">Extracted: {show(v.value, v.kind)}</div>}
                </div>
              );
            })}

            {absent.length > 0 && <div className="text-xs text-muted-foreground">Not on this document: {absent.map((v) => v.label).join(", ")}</div>}

            {x.suspicious_content && (
              <Collapsible>
                <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <ChevronRight className="size-3 transition-transform group-data-panel-open:rotate-90" />
                  Instruction-like text found on the page (recorded, not acted on)
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1.5 rounded-lg border bg-card px-3 py-2 font-mono text-xs whitespace-pre-wrap">{x.suspicious_content}</pre>
                </CollapsibleContent>
              </Collapsible>
            )}

            {doc.confirmed_json && (
              <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3.5 py-2.5", STRIPE.ok)}>
                <span>Confirmed {fmtDate(doc.confirmed_json.confirmed_at.slice(0, 10))}</span>
                <Link href={next ? `${base}/review/${next.docId}` : base} className={cn(buttonVariants({ size: "sm" }))}>
                  {next ? `Next: ${next.label}` : "Back to case"}
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>

      <ConfirmationDialog
        open={requestDoc !== null}
        title="Request a new document?"
        body="Nothing is sent from here. The request stays on the case until a person contacts the student and a new copy arrives."
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
