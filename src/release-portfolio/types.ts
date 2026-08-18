export type ReleaseAdmissionStatus = "READY" | "CONDITIONAL" | "BLOCKED" | "STALE";

export interface PortfolioAdmissionCheck {
  id: "requirement-metadata" | "solution-selection" | "design-units" | "complex-acceptance" | "change-status";
  status: "PASS" | "PENDING" | "FAIL" | "NOT_AVAILABLE";
  message: string;
}

export interface PortfolioRequirement {
  requirementId: string;
  requirementName: string;
  productVersion: string;
  revision: number;
  directory: string;
  admissionStatus: ReleaseAdmissionStatus;
  selectedOptionId?: string;
  moduleIds: string[];
  designUnitCount: number;
  checks: PortfolioAdmissionCheck[];
}

export interface RequirementPortfolio {
  schemaVersion: "1.7";
  generatedAt: string;
  project: { id: string; name: string };
  requirements: PortfolioRequirement[];
  summary: Record<ReleaseAdmissionStatus, number> & { total: number };
}

export interface ProductManagerValueReview {
  businessUrgency: 1 | 2 | 3 | 4 | 5 | null;
  customerCoverage: 1 | 2 | 3 | 4 | 5 | null;
  strategicAlignment: 1 | 2 | 3 | 4 | 5 | null;
  note: string;
}

export interface RequirementAssessment {
  requirementId: string;
  admissionStatus: ReleaseAdmissionStatus;
  evidence: { moduleCount: number; designUnitCount: number; selectedOptionId?: string };
  structuralValue: { platformReuse: number; scenarioCoverage: number };
  deliveryCost: { designComplexity: number; moduleBreadth: number; implementationRisk: number; regressionScope: number; average: number };
  productManagerReview: ProductManagerValueReview;
  reviewStatus: "AWAITING_PM_REVIEW" | "CONFIRMED";
  technicalPriorityIndex: number;
  finalPriorityScore?: number;
  priorityBand?: "P0" | "P1" | "P2" | "P3";
}

export interface PortfolioAssessment {
  schemaVersion: "1.7";
  generatedAt: string;
  portfolioGeneratedAt: string;
  requirements: RequirementAssessment[];
  summary: { total: number; confirmed: number; awaitingReview: number };
}
