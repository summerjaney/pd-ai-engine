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
