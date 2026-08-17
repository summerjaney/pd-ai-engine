import type { PlatformKnowledgeEntity, PlatformKnowledgeKind } from "../platform-knowledge/types.js";

export const PRODUCT_SOURCE_TYPES = ["company-profile", "product-architecture", "product-design", "prd", "prototype", "training", "other"] as const;
export type ProductSourceType = (typeof PRODUCT_SOURCE_TYPES)[number];
export const PRODUCT_SOURCE_SENSITIVITIES = ["public", "internal", "confidential"] as const;
export type ProductSourceSensitivity = (typeof PRODUCT_SOURCE_SENSITIVITIES)[number];

export interface ProductSourceRecord {
  id: string;
  name: string;
  type: ProductSourceType;
  format: "md" | "txt" | "json" | "docx" | "pptx" | "axure-rp" | "axure-html" | "other";
  product: string;
  version?: string;
  sensitivity: ProductSourceSensitivity;
  originalFileName: string;
  storedPath: string;
  contentFingerprint: string;
  registeredAt: string;
  excludeFromPublicFixture: boolean;
}

export interface ProductSourceCatalog {
  schemaVersion: "1.5";
  sources: ProductSourceRecord[];
}

export interface ExtractedSection {
  id: string;
  title: string;
  content: string;
  parentId?: string;
  pageType?: "folder" | "page" | "document-section";
  url?: string;
  locator: { page?: number; section?: string; entry?: string };
}

export interface ExtractedRelation {
  type: "parent-child" | "links-to";
  from: string;
  to: string;
  evidence: string;
}

export interface ProductSourceExtraction {
  schemaVersion: "1.5";
  source: ProductSourceRecord;
  extractedAt: string;
  status: "extracted" | "manual-input-required";
  sections: ExtractedSection[];
  relations?: ExtractedRelation[];
  warnings: string[];
}

export interface MaterialKnowledgeCandidate {
  id: string;
  kind: PlatformKnowledgeKind;
  status: "draft";
  confidence: "low" | "medium" | "high";
  entity: PlatformKnowledgeEntity;
  evidence: {
    sourceId: string;
    sectionId: string;
    sectionTitle: string;
    locator: ExtractedSection["locator"];
    excerpt: string;
    contentFingerprint: string;
  };
}

export interface MaterialKnowledgeDerivation {
  schemaVersion: "1.5";
  sourceId: string;
  status: "pending-product-manager-review";
  generatedAt: string;
  extractor?: { id: string; mode: "rule" | "llm"; model?: string };
  candidates: MaterialKnowledgeCandidate[];
}

export type CandidateComparisonDecision = "duplicate" | "supplement" | "new-version" | "new-knowledge" | "conflict" | "needs-review";

export interface CandidateComparison {
  candidateId: string;
  existingId?: string;
  decision: CandidateComparisonDecision;
  reasons: string[];
  requiresHumanConfirmation: true;
}

export interface MaterialKnowledgeComparisonReport {
  schemaVersion: "1.5";
  sourceId: string;
  catalogVersion: string;
  comparedAt: string;
  comparisons: CandidateComparison[];
}

export const MATERIAL_REVIEW_ACTIONS = ["pending", "accept-new", "merge-source", "create-version", "reject"] as const;
export type MaterialReviewAction = (typeof MATERIAL_REVIEW_ACTIONS)[number];

export interface MaterialReviewDecisionFile {
  schemaVersion: "1.5";
  sourceId: string;
  catalogVersion: string;
  reviewedBy: "product-manager";
  reviewedAt?: string;
  decisions: Array<{ candidateId: string; action: MaterialReviewAction; note?: string }>;
}

export interface MaterialPromotionPackage {
  schemaVersion: "1.5";
  sourceId: string;
  catalogVersion: string;
  status: "approved-for-explicit-promotion";
  approvedAt: string;
  approvedBy: "product-manager";
  candidates: MaterialKnowledgeCandidate[];
}
