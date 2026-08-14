import type { PlatformDecisionConfirmation } from "../platform-analysis/confirmation.js";

export type KnowledgeFeedbackType = "capability" | "rule" | "pattern" | "decision";

export interface KnowledgeFeedbackCandidate {
  id: string;
  type: KnowledgeFeedbackType;
  name: string;
  status: "candidate";
  summary: string;
  source: { requirementId: string; requirementRevision: number; artifact: string };
  evidence: string[];
}

export interface KnowledgeFeedbackReport {
  schemaVersion: "1.2";
  requirement: { id: string; revision: number; name: string };
  platformDecision: PlatformDecisionConfirmation["decision"];
  generatedAt: string;
  status: "pending-human-acceptance";
  candidates: KnowledgeFeedbackCandidate[];
}

export interface AcceptedKnowledgeEntry extends Omit<KnowledgeFeedbackCandidate, "status"> {
  status: "accepted";
  acceptedAt: string;
  acceptedBy: "product-manager";
}

export interface ProductKnowledgeIndex {
  schemaVersion: "1.2";
  workspaceId: string;
  sequence: number;
  updatedAt: string;
  entries: AcceptedKnowledgeEntry[];
}
