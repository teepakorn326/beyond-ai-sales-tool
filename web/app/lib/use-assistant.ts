"use client";

// One conversation with the case assistant, shared by the Assistant page and
// the chat card on the case overview. Holds the messages and the ask/approve
// round trip; rendering is the caller's.

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { errorOf, useToast } from "../components/ui";
import type { AssistantReply, Decision, Proposal } from "./assistant-types";
import type { CaseStatus } from "./case-status";

export type Msg =
  | { role: "user"; text: string }
  | { role: "ai"; text: string; outsideScope: boolean }
  | { role: "proposal"; question: string; proposal: Proposal; threadId: string | null; done: "approved" | "rejected" | null }
  | { role: "unavailable"; text: string };

export const TOOL_LABEL: Record<string, string> = {
  draft_student_message: "Draft a message to the student",
  request_document: "Request a document from the student",
  escalate_to_visa_team: "Escalate to the visa team",
  flag_document: "Flag a document",
};

const LODGEMENT_SUGGESTIONS = ["Why is this case blocked?", "Which documents still need review?", "Does the student's name match?", "What needs to happen before submission?"];
const PROGRAMME_SUGGESTIONS = ["Which programmes fit this student?", "หลักสูตรไหนเหมาะกับน้องคนนี้"];

/** A verified case is past lodgement questions; lead with the programme ones. */
export function suggestionsFor(status: CaseStatus | undefined): string[] {
  return status === "ready" ? [...PROGRAMME_SUGGESTIONS, ...LODGEMENT_SUGGESTIONS] : [...LODGEMENT_SUGGESTIONS, ...PROGRAMME_SUGGESTIONS];
}

export function useAssistant(caseId: string) {
  const router = useRouter();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(
    async (question: string, decision: Decision | null = null, at: number | null = null, threadId: string | null = null) => {
      if (!question.trim() || !caseId) return;
      setBusy(true);
      if (!decision) setMsgs((m) => [...m, { role: "user", text: question }]);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, case_id: caseId, decision, thread_id: threadId }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          setMsgs((m) => [...m, { role: "unavailable", text: errorOf(body, res.status, "The assistant did not respond") }]);
          return;
        }
        const r = body as AssistantReply;
        if (r.unavailable) {
          setMsgs((m) => [...m, { role: "unavailable", text: r.unavailable! }]);
          return;
        }
        setMsgs((m) => {
          const next = [...m];
          if (decision && at !== null) {
            const p = next[at];
            if (p && p.role === "proposal") next[at] = { ...p, done: decision === "approve" ? "approved" : "rejected" };
          }
          if (r.answer) next.push({ role: "ai", text: r.answer, outsideScope: r.outsideScope });
          if (r.proposal) next.push({ role: "proposal", question, proposal: r.proposal, threadId: r.thread_id, done: null });
          return next;
        });
        if (decision === "approve") {
          toast("ok", "Action approved and recorded");
          router.refresh();
        } else if (decision === "reject") toast("info", "Proposal rejected and recorded");
      } catch {
        setMsgs((m) => [...m, { role: "unavailable", text: "Could not reach the server" }]);
      } finally {
        setBusy(false);
      }
    },
    [caseId, router, toast],
  );

  /** Drop a proposal the person discards before it ever reached the agent's approval step. */
  const drop = useCallback((at: number) => setMsgs((xs) => xs.filter((_, j) => j !== at)), []);
  const reset = useCallback(() => setMsgs([]), []);

  return { msgs, busy, ask, drop, reset };
}
