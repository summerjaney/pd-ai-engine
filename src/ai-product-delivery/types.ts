export interface AiDeliveryTraceItem {
  id: string;
  requirementId: string;
  pageIds: string[];
  dslModules: string[];
  acceptanceCriterionId: string;
  status: "PASS" | "FAIL";
}

export interface AiDeliveryValidationReport {
  schemaVersion: "2.1";
  status: "READY_FOR_HUMAN_REVIEW" | "FAIL";
  checks: Array<{ id: string; status: "PASS" | "FAIL"; evidence: string }>;
  traceability: { total: number; passed: number; missing: number };
  manualReviewItems: string[];
}

export interface AiProjectValidationReport {
  schemaVersion: "2.1";
  project: "low-code-ai-app-builder";
  status: "READY_FOR_HUMAN_REVIEW";
  generatedArtifacts: string[];
  validatedCapabilities: string[];
  retainedHumanResponsibilities: string[];
  knowledgeCandidates: string[];
}
