export interface ReleaseSuccessMetric {
  id: string;
  name: string;
  definition: string;
  baseline: string;
  target: string;
  observationWindow: string;
  dataSource: string;
}

export interface ReleaseObjectiveInput {
  objective: string;
  targetUsers: string[];
  opportunityIds: string[];
  metrics: ReleaseSuccessMetric[];
  owner: string;
}

export interface ReleaseObjective extends ReleaseObjectiveInput {
  schemaVersion: "1.9";
  productVersion: string;
  scopeDecisionHash: string;
  confirmedAt: string;
  confirmedBy: "product-manager";
}

export interface ReleaseObjectiveCheck { valid: boolean; stale: boolean; issues: string[]; }
