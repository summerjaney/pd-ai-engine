export const PLATFORM_KNOWLEDGE_KINDS = ["capability", "pattern", "component", "constraint", "case"] as const;
export type PlatformKnowledgeKind = (typeof PLATFORM_KNOWLEDGE_KINDS)[number];

export const PLATFORM_KNOWLEDGE_STATUSES = ["draft", "confirmed", "deprecated", "superseded"] as const;
export type PlatformKnowledgeStatus = (typeof PLATFORM_KNOWLEDGE_STATUSES)[number];

export const PLATFORM_KNOWLEDGE_SOURCE_TYPES = [
  "existing-feature",
  "confirmed-prd",
  "product-design",
  "released-requirement",
  "product-manager",
  "pae-feedback",
] as const;
export type PlatformKnowledgeSourceType = (typeof PLATFORM_KNOWLEDGE_SOURCE_TYPES)[number];

export interface PlatformKnowledgeSource {
  type: PlatformKnowledgeSourceType;
  document: string;
  section?: string;
  version?: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface PlatformKnowledgeReference {
  id: string;
  kind: PlatformKnowledgeKind;
}

export interface PlatformKnowledgeBase {
  id: string;
  kind: PlatformKnowledgeKind;
  name: string;
  description: string;
  version: string;
  status: PlatformKnowledgeStatus;
  tags: string[];
  source: PlatformKnowledgeSource;
  references: PlatformKnowledgeReference[];
}

export interface PlatformCapability extends PlatformKnowledgeBase {
  kind: "capability";
  domain: string;
  module: string;
  level: "platform" | "project";
  supportedScenarios: string[];
  constraints: string[];
}

export interface PlatformPattern extends PlatformKnowledgeBase {
  kind: "pattern";
  applicableScenarios: string[];
  nonApplicableScenarios: string[];
  pageStructure: string[];
  interactionRules: string[];
}

export interface PlatformComponent extends PlatformKnowledgeBase {
  kind: "component";
  componentType: string;
  usageRules: string[];
}

export interface PlatformConstraint extends PlatformKnowledgeBase {
  kind: "constraint";
  severity: "error" | "warning";
  rule: string;
}

export interface PlatformCase extends PlatformKnowledgeBase {
  kind: "case";
  requirement: string;
  decision: "configuration" | "platform-extension" | "project-customization";
  outcome: string;
}

export type PlatformKnowledgeEntity =
  | PlatformCapability
  | PlatformPattern
  | PlatformComponent
  | PlatformConstraint
  | PlatformCase;

export interface PlatformKnowledgeCatalogFile {
  schemaVersion: "1.4";
  version: string;
  product: { id: string; name: string; version: string };
  entries: string[];
}

export interface PlatformKnowledgeCatalog {
  schemaVersion: "1.4";
  version: string;
  product: PlatformKnowledgeCatalogFile["product"];
  entities: PlatformKnowledgeEntity[];
  byId: ReadonlyMap<string, PlatformKnowledgeEntity>;
}

export interface PlatformKnowledgeMatch {
  id: string;
  kind: PlatformKnowledgeKind;
  name: string;
  score: number;
  version: string;
  source: PlatformKnowledgeSource;
}

export interface CapabilityGapAssessment {
  schemaVersion: "1.4";
  requirement: { title: string; fingerprint: string };
  platformKnowledge: { productId: string; productVersion: string; catalogVersion: string };
  matched: PlatformKnowledgeMatch[];
  reuse: {
    capabilities: string[];
    patterns: string[];
    components: string[];
    constraints: string[];
  };
  gaps: Array<{ id: string; description: string; evidence: string; status: "needs-confirmation" }>;
  boundary: {
    recommendation: "configuration" | "platform-enhancement" | "project-customization" | "project-validation";
    confidence: "low" | "medium" | "high";
    basis: string[];
    requiresHumanConfirmation: true;
  };
}
