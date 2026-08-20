export interface SuccessMetric {
  id: string;
  name: string;
  definition: string;
  baseline: string;
  target: string;
  observationWindow: string;
  dataSource: string;
}

export interface RequirementValueChain {
  schemaVersion: "1.9";
  requirementId: string;
  requirementFingerprint: string;
  discoveryHash: string;
  problemId: string;
  opportunityId: string;
  valueHypothesisId: string;
  successMetric: SuccessMetric;
  linkedAt: string;
  linkedBy: "product-manager";
}

export interface ValueChainCheck {
  valid: boolean;
  stale: boolean;
  issues: string[];
}
