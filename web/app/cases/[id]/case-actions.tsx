"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Hint } from "../../components/hint";
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

  const ack = (undo: boolean) => post(`/api/cases/${encodeURIComponent(caseId)}/acknowledge`, { rule_id: check.rule_id, undo }, undo ? "Confirmation removed" : "Confirmed");
  const review = (t: DocType, label: string) => {
    const id = docIdByType[t];
    return id ? (
      <Link key={t} href={`${base}/review/${id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        {label}
      </Link>
    ) : null;
  };
  const requestBtn = (t: DocType, label: string) =>
    docIdByType[t] ? (
      <Button key={`req-${t}`} variant="outline" size="sm" className="border-dashed" onClick={() => setRequest(t)} disabled={busy}>
        <FileText />
        {label}
      </Button>
    ) : null;

  let buttons: React.ReactNode[] = [];
  if (check.status === "pending") {
    buttons = [];
  } else if (check.verdict === "warn") {
    buttons = acknowledged
      ? [
          <Button key="undo" variant="ghost" size="xs" onClick={() => ack(true)} disabled={busy}>
            Undo
          </Button>,
        ]
      : [
          <Button key="ack" size="sm" onClick={() => ack(false)} disabled={busy}>
            {check.rule_id === "R1" ? "Same person, continue" : "Accept and continue"}
          </Button>,
          check.rule_id === "R1" ? requestBtn("transcript", "Request reissued transcript") : null,
          check.rule_id === "R4" ? requestBtn("passport", "Request renewed passport") : null,
          check.rule_id === "R5" ? requestBtn("english_test", "Request new English test") : null,
          check.rule_id === "R1" || check.rule_id === "R2" ? review("transcript", "Compare") : null,
          check.rule_id === "R3" ? review("degree_certificate", "Open certificate") : null,
        ];
  } else if (check.verdict === "block") {
    switch (check.rule_id) {
      case "R1":
        buttons = [requestBtn("transcript", "Request reissued transcript"), review("transcript", "Compare")];
        break;
      case "R2":
        buttons = check.detail.includes("543")
          ? [review("transcript", "Re-check transcript"), review("english_test", "Re-check English test")]
          : [requestBtn("transcript", "Request reissued transcript"), review("transcript", "Compare")];
        break;
      case "R3":
        buttons = [review("transcript", "Open transcript"), review("degree_certificate", "Open certificate")];
        break;
      case "R4":
        buttons = [
          requestBtn("passport", "Request renewed passport"),
          <a key="meta" href="#case-details" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Change course end date
          </a>,
        ];
        break;
      case "R5":
        buttons = [
          requestBtn("english_test", "Request new English test"),
          <a key="meta" href="#case-details" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
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
        body="Nothing is sent from here. The request stays on the case until a person contacts the student and a new copy arrives."
        confirmLabel="Record request"
        busy={busy}
        onCancel={() => setRequest(null)}
        onConfirm={async () => {
          if (!reqDoc) return;
          await post(`/api/documents/${reqDoc}/requests`, { kind: "new_document" }, "Request recorded");
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
      toast("ok", "Saved");
      router.refresh();
    } catch {
      toast("err", "Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, key: Exclude<keyof typeof form, "country">, type: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`case-${key}`} className="text-xs text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </Label>
      <Input id={`case-${key}`} type={type} value={form[key]} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} onBlur={(e) => e.target.value !== (meta[key] ?? "") && save({ [key]: e.target.value })} />
    </div>
  );

  return (
    <Card size="sm" id="case-details">
      <CardHeader>
        <CardTitle>Case details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {field("Intake", "intake", "month")}
        {field("Submission target", "submission_target", "date", "The English test must still be valid on this date.")}
        {field("Course end date", "course_end_date", "date", "The passport must cover this date, with a buffer.")}
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Destination</Label>
          <Select value={form.country} items={{ AU: "Australia", NZ: "New Zealand" }} disabled={busy} onValueChange={(v) => save({ country: v === "NZ" ? "NZ" : "AU" })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AU">Australia</SelectItem>
              <SelectItem value="NZ">New Zealand</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {field("Reviewer", "assignee", "text")}
      </CardContent>
    </Card>
  );
}
