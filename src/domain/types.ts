export const STAGE_IDS = [
  "requirement-analysis",
  "product-outline",
  "product-architecture",
  "core-flow",
  "page-structure",
  "prototype",
  "mastergo",
  "prototype-confirmation",
  "prd",
  "review",
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export interface RequirementInput {
  sourcePath: string;
  content: string;
  title: string;
}

export interface RequirementContext {
  projectId: string;
  projectName: string;
  productVersion: string;
  requirementId: string;
  requirementName: string;
  revision: number;
}

export interface PrototypeField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "datetime";
  required: boolean;
}

export interface PrototypeAction {
  id: string;
  label: string;
  kind: "primary" | "secondary" | "danger";
  confirmation?: boolean;
}

export interface PrototypePage {
  id: string;
  name: string;
  route: string;
  pattern: "list" | "form" | "detail";
  fields: PrototypeField[];
  actions: PrototypeAction[];
}

export interface DesignTokens {
  colors: Record<string, string>;
  spacing: Record<string, number>;
  radius: Record<string, number>;
  typography: {
    fontSize: Record<string, number>;
    fontWeight: Record<string, number>;
    lineHeight: Record<string, number>;
  };
}

export interface PrototypeDsl {
  schemaVersion: "0.2";
  product: { name: string; description: string; sourceAttribution?: string };
  navigation: Array<{ label: string; pageId: string; roles?: string[] }>;
  pages: PrototypePage[];
  rules: Array<{ id: string; description: string; appliesTo: string[] }>;
  transitions: PrototypeTransition[];
  designTokens: DesignTokens;
}

export interface PrototypeTransition {
  sourcePageId: string;
  triggerType: "navigation" | "action";
  triggerId: string;
  triggerLabel: string;
  targetPageId: string;
}

export interface PrototypePageManifest {
  id: string;
  name: string;
  route: string;
  pattern: PrototypePage["pattern"];
  roles: string[];
  fieldCount: number;
  actionCount: number;
  preview: string;
}

export interface PrototypeBundleManifest {
  schemaVersion: "0.2";
  entry: "prototype.html";
  dsl: "prototype.json";
  mastergoData: "mastergo-data.json";
  previewDirectory: "preview";
  navigation: PrototypeDsl["navigation"];
  pages: PrototypePageManifest[];
  transitions: PrototypeTransition[];
}

export interface MasterGoScreenNode {
  id: string;
  name: string;
  type: "field" | "action" | "section";
  component: string;
  description: string;
  required?: boolean;
}

export interface MasterGoScreen {
  id: string;
  name: string;
  route: string;
  pattern: PrototypePage["pattern"];
  frame: { width: number; height: number };
  nodes: MasterGoScreenNode[];
  interactions: PrototypeTransition[];
}

export interface MasterGoData {
  schemaVersion: "0.2";
  product: PrototypeDsl["product"];
  tokens: {
    color: Record<string, string>;
    spacing: Record<string, number>;
    radius: Record<string, number>;
  };
  screens: MasterGoScreen[];
}

export interface MasterGoResult {
  schemaVersion: "0.2";
  fileId?: string;
  pageId?: string;
  nodeId?: string;
  createdPages: Array<{
    pageId: string;
    pageName: string;
    nodeId: string;
  }>;
  createdAt: string;
  status: "pending" | "confirmed" | "rejected";
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface WorkflowArtifacts {
  "requirement-analysis"?: string;
  "product-outline"?: string;
  "product-architecture"?: string;
  "core-flow"?: string;
  "page-structure"?: string;
  prototype?: PrototypeDsl;
  mastergo?: {
    data: MasterGoData;
    result?: MasterGoResult;
  };
  "prototype-confirmation"?: {
    status: "pending" | "confirmed" | "rejected";
    confirmedAt?: string;
    confirmedBy?: string;
    comments?: string[];
  };
  prd?: string;
  review?: string;
}

export interface StageResultWithStatus {
  id: StageId;
  status: "completed" | "failed" | "skipped";
  file?: string;
  warnings?: string[];
  error?: string;
}

export interface WorkflowContext {
  runId: string;
  startedAt: string;
  input: RequirementInput;
  artifacts: WorkflowArtifacts;
  requirement?: RequirementContext;
  stageResults?: StageResultWithStatus[];
  outputDirectory?: string;
  knowledge?: import("../knowledge/types.js").WorkflowKnowledgeContext;
  knowledgeCompliance?: import("../knowledge/compliance-validator.js").KnowledgeComplianceResult;
}

export interface StageResult {
  stage: StageId;
  artifact: string | PrototypeDsl | {
    data: MasterGoData;
    result?: MasterGoResult;
  } | {
    status: "pending" | "confirmed" | "rejected";
    confirmedAt?: string;
    confirmedBy?: string;
    comments?: string[];
  };
  warnings: string[];
  generationMetadata?: {
    generationMode: "mock" | "llm";
    provider: "mock" | "openai";
    model: string;
    promptVersion: string;
    generatedAt: string;
    attempts: number;
    validationStatus: "passed" | "failed";
    knowledge?: import("../knowledge/trace.js").KnowledgeTrace;
  };
}

export interface StageExecutor {
  execute(stage: StageId, context: Readonly<WorkflowContext>): Promise<StageResult>;
}
