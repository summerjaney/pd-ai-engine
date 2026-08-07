export const KNOWLEDGE_TYPES = ["business", "pattern", "component", "rule"] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export const KNOWLEDGE_STATUSES = ["active", "deprecated"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export interface KnowledgeReference {
  id: string;
  type: KnowledgeType;
}

export interface KnowledgeEntityBase {
  id: string;
  type: KnowledgeType;
  name: string;
  description: string;
  version: string;
  status: KnowledgeStatus;
  tags: string[];
  appliesTo: string[];
  references: KnowledgeReference[];
}

export interface BusinessKnowledge extends KnowledgeEntityBase {
  type: "business";
}

export interface PatternKnowledge extends KnowledgeEntityBase {
  type: "pattern";
}

export interface ComponentKnowledge extends KnowledgeEntityBase {
  type: "component";
}

export const RULE_SEVERITIES = ["error", "warning"] as const;
export type RuleSeverity = (typeof RULE_SEVERITIES)[number];
export const RULE_CHECK_TYPES = ["prototype", "text", "manual"] as const;
export type RuleCheckType = (typeof RULE_CHECK_TYPES)[number];

export interface RuleAssertion {
  operator: "exists" | "equals" | "includes" | "requires-confirmation";
  path: string;
  value?: string | number | boolean;
}

export interface RuleKnowledge extends KnowledgeEntityBase {
  type: "rule";
  severity: RuleSeverity;
  checkType: RuleCheckType;
  assertion: RuleAssertion;
}

export type KnowledgeEntity =
  | BusinessKnowledge
  | PatternKnowledge
  | ComponentKnowledge
  | RuleKnowledge;

export interface KnowledgeCatalogFile {
  schemaVersion: "0.5";
  version: string;
  entries: string[];
}

export interface KnowledgeCatalog {
  schemaVersion: "0.5";
  version: string;
  entities: KnowledgeEntity[];
  byId: ReadonlyMap<string, KnowledgeEntity>;
}

export type KnowledgeSelectionSource = "automatic" | "explicit";

export interface SelectedKnowledge {
  knowledgeId: string;
  version: string;
  type: KnowledgeType;
  source: KnowledgeSelectionSource;
  reason: string;
  score: number;
}

export interface KnowledgeSelectionInput {
  text: string;
  metadata?: Record<string, string | string[]>;
  explicitKnowledgeIds?: string[];
}

export interface KnowledgeSelectionResult {
  catalogVersion: string;
  selectedKnowledge: SelectedKnowledge[];
}

export interface WorkflowKnowledgeContext {
  catalog: KnowledgeCatalog;
  selection: KnowledgeSelectionResult;
}
