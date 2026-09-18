"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "../components/icons";
import { Markdown } from "../components/markdown";
import { ConfirmationDialog } from "../components/ui";
import type { CaseStatus } from "../lib/case-status";
import { suggestionsFor, TOOL_LABEL, useAssistant } from "../lib/use-assistant";

export interface CaseOption {
  id: string;
  label: string;
  student: string | null;
  status: CaseStatus;
}

export function AssistantThread({ options, selected, hasModel }: { options: CaseOption[]; selected: string | null; hasModel: boolean }) {
  const router = useRouter();
  const [caseId, setCaseId] = useState(selected ?? "");
  const { msgs, busy, ask, drop, reset } = useAssistant(caseId);
  const [input, setInput] = useState("");
  const [approving, setApproving] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  const pending = approving !== null ? msgs[approving] : null;
  const current = options.find((o) => o.id === caseId);

  return (
    <div className="card" style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 14, minHeight: 560 }}>
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <label className="row" style={{ gap: 8 }}>
          <span className="label">Case</span>
          <select className="select" value={caseId} onChange={(e) => (setCaseId(e.target.value), reset(), router.replace(`/assistant?case=${encodeURIComponent(e.target.value)}`))} disabled={busy}>
            {options.length === 0 && <option value="">No cases yet</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.student ? ` · ${o.student}` : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">{hasModel ? "Model connected" : "Running deterministic nodes only (no API key): rule results and next steps, no free-text reasoning"}</span>
      </div>

      {msgs.length === 0 && (
        <div className="row wrap" style={{ gap: 8 }}>
          {suggestionsFor(current?.status).map((s) => (
            <button key={s} type="button" className="btn secondary sm" onClick={() => ask(s)} disabled={busy || !caseId}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="thread">
        {msgs.map((m, i) => {
          switch (m.role) {
            case "user":
              return (
                <div key={i} className="msg user">
                  {m.text}
                </div>
              );
            case "ai":
              return (
                <div key={i} className={`msg ai${m.outsideScope ? " scope" : ""}`}>
                  <div className="overline" style={{ marginBottom: 6 }}>
                    {m.outsideScope ? "Assistant · outside scope" : "Assistant · reads case record only"}
                  </div>
                  <Markdown text={m.text} />
                </div>
              );
            case "proposal":
              return (
                <div key={i} className="approval">
                  <div className="row overline" style={{ color: "var(--warning-text)" }}>
                    <Icon name="tri" size={13} />
                    {m.done === "approved" ? "Approved · action recorded" : m.done === "rejected" ? "Rejected · nothing sent" : "Approval required · external action"}
                  </div>
                  <div className="value" style={{ marginTop: 4, fontSize: 15 }}>
                    {TOOL_LABEL[m.proposal.tool] ?? m.proposal.tool}
                  </div>
                  <div className="muted small">
                    Tool: <span className="mono">{m.proposal.tool}</span>
                  </div>
                  <div className="draft">{m.proposal.args}</div>
                  <div className="t2 small">{m.proposal.reason}</div>
                  {!m.done && (
                    <div className="row" style={{ marginTop: 10 }}>
                      <button type="button" className="btn primary sm" onClick={() => setApproving(i)} disabled={busy}>
                        Review action
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy}
                        onClick={() => (m.threadId ? ask(m.question, "reject", i, m.threadId) : drop(i))}
                      >
                        Discard
                      </button>
                    </div>
                  )}
                  <div className="muted small" style={{ marginTop: 8 }}>
                    Nothing is sent until a person approves. The approval is recorded in the audit log.
                  </div>
                </div>
              );
            case "unavailable":
              return (
                <div key={i} className="alert">
                  Assistant not available: {m.text}
                </div>
              );
          }
        })}
        {busy && (
          <div className="msg ai muted">
            <Icon name="dotted" size={14} /> Working…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="spacer" />
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          const q = input;
          setInput("");
          ask(q);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this case, in Thai or English" aria-label="Question" disabled={busy || !caseId} />
        <button type="submit" className="btn primary sm" disabled={busy || !input.trim() || !caseId}>
          <Icon name="send" size={14} />
          Send
        </button>
      </form>

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
    </div>
  );
}
