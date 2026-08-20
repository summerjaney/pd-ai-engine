export const MARKET_EVIDENCE_TYPES = ["competitor", "customer-feedback", "business-metric", "internal-insight"] as const;
export type MarketEvidenceType = (typeof MARKET_EVIDENCE_TYPES)[number];

export const MARKET_EVIDENCE_SENSITIVITIES = ["public", "internal", "confidential"] as const;
export type MarketEvidenceSensitivity = (typeof MARKET_EVIDENCE_SENSITIVITIES)[number];

export interface MarketEvidenceLocator {
  url?: string;
  section?: string;
  page?: number;
  recordId?: string;
}

export interface MarketEvidenceInput {
  id: string;
  name: string;
  type: MarketEvidenceType;
  source: string;
  collectedAt: string;
  sensitivity: MarketEvidenceSensitivity;
  summary: string;
  locator: MarketEvidenceLocator;
}

export interface MarketEvidence extends MarketEvidenceInput {
  schemaVersion: "1.9";
  contentFingerprint: string;
  registeredAt: string;
  excludeFromPublicDelivery: boolean;
}

export interface MarketEvidenceCatalog {
  schemaVersion: "1.9";
  evidence: MarketEvidence[];
}
