// Wire shape between /api/assistant and the assistant screen. Kept out of the
// route module so the client bundle never imports server-only code.

export interface Proposal {
  tool: string;
  args: string;
  reason: string;
}

export interface AssistantReply {
  answer: string;
  proposal: Proposal | null;
  /** The proposal was approved and the tool ran. */
  executed: boolean;
  outsideScope: boolean;
  /** Set when the agent could not run at all; a hint for the operator. */
  unavailable: string | null;
  /** LangGraph thread holding a pending approval (HTTP agent only). */
  thread_id: string | null;
}

export type Decision = "approve" | "reject";
