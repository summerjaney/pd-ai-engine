export type ReleaseOptionId = "foundation-first" | "value-first" | "risk-control";

export interface ReleaseCandidateOption {
  id: ReleaseOptionId;
  name: string;
  rationale: string[];
  includedRequirementIds: string[];
  deferredRequirementIds: string[];
  moduleIds: string[];
  estimatedCost: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  blockerRelationshipIds: string[];
}

export interface ReleaseOptionSet {
  schemaVersion: "1.7";
  productVersion: string;
  generatedAt: string;
  inputFingerprint: string;
  status: "pending-product-manager-selection";
  options: ReleaseCandidateOption[];
}

export interface ReleaseScopeDecision {
  schemaVersion: "1.7";
  productVersion: string;
  status: "selected";
  optionSetFingerprint: string;
  selectedOptionId: ReleaseOptionId;
  includedRequirementIds: string[];
  deferredRequirementIds: string[];
  note?: string;
  selectedAt: string;
  selectedBy: "product-manager";
}
