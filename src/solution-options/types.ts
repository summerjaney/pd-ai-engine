import type { PlatformBoundaryPath } from "../platform-analysis/types.js";

export type SolutionOptionId = "configuration" | "platform-enhancement" | "product-extension" | "project-customization" | "architecture-assessment";

export interface SolutionOption {
  id: SolutionOptionId;
  name: string;
  path: PlatformBoundaryPath;
  description: string;
  scope: string[];
  tradeoffs: {
    universality: 1 | 2 | 3 | 4 | 5;
    reuseValue: 1 | 2 | 3 | 4 | 5;
    implementationCost: 1 | 2 | 3 | 4 | 5;
    impactRisk: 1 | 2 | 3 | 4 | 5;
    maintenanceCost: 1 | 2 | 3 | 4 | 5;
  };
  benefits: string[];
  risks: string[];
  prerequisites: string[];
  recommended: boolean;
}

export interface SolutionComparison {
  schemaVersion: "1.6";
  status: "pending-product-manager-selection";
  impactReportHash: string;
  requirementFingerprint: string;
  moduleCatalogVersion: string;
  generatedAt: string;
  options: SolutionOption[];
  recommendedOptionId: SolutionOptionId;
  recommendationBasis: string[];
  gate: { canProceed: false; reason: string };
}

export interface SolutionDecision {
  schemaVersion: "1.6";
  status: "selected";
  comparisonHash: string;
  impactReportHash: string;
  requirementFingerprint: string;
  moduleCatalogVersion: string;
  selectedOptionId: SolutionOptionId;
  scope: string;
  note?: string;
  selectedAt: string;
  selectedBy: "product-manager";
}

export interface SolutionGateStatus {
  status: "WAITING_SELECTION" | "SELECTED" | "INVALIDATED";
  canProceed: boolean;
  reason: string;
  decision?: SolutionDecision;
}
