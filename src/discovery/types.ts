export type DiscoveryKind = "problem" | "opportunity" | "value-hypothesis";
export type DiscoveryReviewStatus = "pending" | "confirmed" | "rejected";

export interface DiscoveryReview {
  status: DiscoveryReviewStatus;
  note: string;
  reviewedAt?: string;
}

export interface ProblemStatement {
  id: string;
  targetUser: string;
  scenario: string;
  obstacle: string;
  impact: string;
  evidenceIds: string[];
  confidence: "low" | "medium" | "high";
}

export interface Opportunity {
  id: string;
  name: string;
  problemIds: string[];
  affectedScope: string;
  evidenceIds: string[];
  confidence: "low" | "medium" | "high";
}

export interface ValueHypothesis {
  id: string;
  opportunityId: string;
  statement: string;
  expectedOutcome: string;
  evidenceIds: string[];
  confidence: "low" | "medium" | "high";
}

export interface DiscoveryItem<T> {
  value: T;
  review: DiscoveryReview;
}

export interface DiscoveryReport {
  schemaVersion: "1.9";
  generatedAt: string;
  evidenceCatalogHash: string;
  status: "pending-product-manager-review" | "reviewed";
  problems: DiscoveryItem<ProblemStatement>[];
  opportunities: DiscoveryItem<Opportunity>[];
  valueHypotheses: DiscoveryItem<ValueHypothesis>[];
}
