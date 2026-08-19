export type CompetitorDecision = "adopt" | "adapt" | "reject" | "research";
export type PlatformCapabilityStatus = "available" | "partial" | "missing" | "not-applicable";

export interface CompetitorEvidence {
  id: string;
  source: string;
  excerpt: string;
}

export interface CompetitorFeature {
  id: string;
  name: string;
  module: string;
  scenario: string;
  actors: string[];
  operations: string[];
  keywords: string[];
  evidenceIds: string[];
}

export interface CompetitorProfile {
  schemaVersion: "1.8";
  id: string;
  name: string;
  features: CompetitorFeature[];
  evidence: CompetitorEvidence[];
}

export interface PlatformCapabilityBaseline {
  schemaVersion: "1.8";
  product: { id: string; name: string };
  capabilities: Array<{ id: string; name: string; module: string; keywords: string[] }>;
}

export interface CompetitorFeatureAssessment {
  featureId: string;
  featureName: string;
  competitorModule: string;
  scenario: string;
  actors: string[];
  operations: string[];
  matchedCapabilityIds: string[];
  status: PlatformCapabilityStatus;
  decision: CompetitorDecision;
  rationale: string;
  evidenceIds: string[];
  requiresProductManagerReview: true;
}

export interface CompetitorAnalysisReport {
  schemaVersion: "1.8";
  generatedAt: string;
  competitor: { id: string; name: string };
  product: { id: string; name: string };
  sourceHashes: { profile: string; baseline: string };
  assessments: CompetitorFeatureAssessment[];
  summary: Record<PlatformCapabilityStatus, number> & Record<CompetitorDecision, number> & { total: number };
}

export interface CompetitorReviewDecision {
  featureId: string;
  decision: CompetitorDecision;
  scope: string;
  note: string;
  reviewedAt: string;
}

export interface CompetitorReview {
  schemaVersion: "1.8";
  status: "pending" | "reviewed";
  analysisHash: string;
  decisions: Record<string, CompetitorReviewDecision>;
}
