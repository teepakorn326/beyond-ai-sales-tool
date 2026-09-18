"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, SendHorizontal, Sparkles, TriangleAlert } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Hint } from "../../components/hint";
import { Markdown } from "../../components/markdown";
import { ConfirmationDialog } from "../../components/ui";
import type { CaseStatus } from "../../lib/case-status";
import { suggestionsFor, TOOL_LABEL, useAssistant } from "../../lib/use-assistant";

/**
 * The assistant, on the case it belongs to. Same conversation as the
 * Assistant page (same hook, same approval step), shown as a card in the
 * overview's side column so a question is one click from the verdict it is
 * about. Nothing the assistant proposes runs without the approve step.
 */
export function CaseChat({ caseId, status, hasModel }: { caseId: string; status: CaseStatus; hasModel: boolean }) {
  const { msgs, busy, ask, drop } = useAssistant(caseId);
  const [input, setInput] = useState("");
  const [approving, setApproving] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgs.length > 0) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  const pending = approving !== null ? msgs[approving] : null;

  return (
    <Card size="sm" className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-primary" />
          Ask about this case
          <Hint text={hasModel ? "Answers come from this case's confirmed record and the policy notes. Anything that would reach the student needs your approval first." : "No model is connected. Answers are the rule results and next steps only, no free-text reasoning."} />
        </CardTitle>
        <Link href={`/assistant?case=${encodeURIComponent(caseId)}`} className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}>
          Open
          <ArrowUpRight data-icon="inline-end" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestionsFor(status).map((s) => (
              <Button key={s} type="button" variant="outline" size="xs" className="h-auto py-1 whitespace-normal text-left" onClick={() => ask(s)} disabled={busy}>
                {s}
              </Button>
            ))}
          </div>
        )}

        {msgs.length > 0 && (
          <div className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto pr-1">
            {msgs.map((m, i) => {
              switch (m.role) {
                case "user":
                  return (
                    <div key={i} className="self-end rounded-lg border border-(--primary-soft) bg-(--surface-blue) px-3 py-2 text-sm">
                      {m.text}
                    </div>
                  );
                case "ai":
                  return (
                    <div key={i} className={cn("rounded-lg border bg-card px-3 py-2", m.outsideScope && "border-dashed")}>
                      <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{m.outsideScope ? "Outside scope" : "From the case record"}</div>
                      <Markdown text={m.text} />
                    </div>
                  );
                case "proposal":
                  return (
                    <div key={i} className="rounded-lg border border-(--warning) bg-card px-3 py-2 text-sm">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-(--warning-text) uppercase">
                        <TriangleAlert className="size-3" />
                        {m.done === "approved" ? "Approved · recorded" : m.done === "rejected" ? "Rejected · nothing sent" : "Needs your approval"}
                      </div>
                      <div className="mt-1 font-semibold">{TOOL_LABEL[m.proposal.tool] ?? m.proposal.tool}</div>
                      <div className="mt-1.5 rounded-md border bg-background px-2 py-1.5 font-mono text-xs whitespace-pre-wrap text-(--text-2)">{m.proposal.args}</div>
                      <div className="mt-1 text-xs text-(--text-2)">{m.proposal.reason}</div>
                      {!m.done && (
                        <div className="mt-2 flex gap-2">
                          <Button type="button" size="xs" onClick={() => setApproving(i)} disabled={busy}>
                            Review action
                          </Button>
                          <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => (m.threadId ? ask(m.question, "reject", i, m.threadId) : drop(i))}>
                            Discard
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                case "unavailable":
                  return (
                    <div key={i} className="rounded-lg border border-(--error) bg-(--error-soft) px-3 py-2 text-sm text-(--error-text)">
                      Assistant not available: {m.text}
                    </div>
                  );
              }
            })}
            {busy && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                Working…
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input;
            setInput("");
            ask(q);
          }}
        >
          <Input id={`case-chat-${caseId}`} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask in Thai or English" aria-label="Question about this case" disabled={busy} />
          <Button type="submit" size="icon" aria-label="Send" disabled={busy || !input.trim()}>
            <SendHorizontal />
          </Button>
        </form>
      </CardContent>

      <ConfirmationDialog
        open={pending?.role === "proposal"}
        title={pending?.role === "proposal" ? `Approve: ${TOOL_LABEL[pending.proposal.tool] ?? pending.proposal.tool}?` : ""}
        body="This action reaches the student or another team. It runs only after you approve, and the approval is bound to exactly this tool and these arguments."
        confirmLabel="Approve and run"
        busy={busy}
        onCancel={() => setApproving(null)}
        onConfirm={async () => {
          if (pending?.role === "proposal" && approving !== null) {
            const at = approving;
            setApproving(null);
            await ask(pending.question, "approve", at, pending.threadId);
          }
        }}
      >
        {pending?.role === "proposal" && <div className="draft">{pending.proposal.args}</div>}
      </ConfirmationDialog>
    </Card>
  );
}
