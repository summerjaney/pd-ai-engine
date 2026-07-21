export const STAGE_IDS = [
  "requirement-analysis",
  "product-outline",
  "product-architecture",
  "core-flow",
  "page-structure",
  "prototype",
  "prd",
  "review",
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export interface RequirementInput {
  sourcePath: string;
  content: string;
  title: string;
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
}

export interface PrototypePage {
  id: string;
  name: string;
  route: string;
  pattern: "list" | "form" | "detail";
  fields: PrototypeField[];
  actions: PrototypeAction[];
}

export interface PrototypeDsl {
  schemaVersion: "0.1";
  product: { name: string; description: string };
  navigation: Array<{ label: string; pageId: string; roles?: string[] }>;
  pages: PrototypePage[];
  rules: Array<{ id: string; description: string; appliesTo: string[] }>;
}

export interface WorkflowArtifacts {
  "requirement-analysis"?: string;
  "product-outline"?: string;
  "product-architecture"?: string;
  "core-flow"?: string;
  "page-structure"?: string;
  prototype?: PrototypeDsl;
  prd?: string;
  review?: string;
}

export interface WorkflowContext {
  runId: string;
  startedAt: string;
  input: RequirementInput;
  artifacts: WorkflowArtifacts;
}

export interface StageResult {
  stage: StageId;
  artifact: string | PrototypeDsl;
  warnings: string[];
}

export interface StageExecutor {
  execute(stage: StageId, context: Readonly<WorkflowContext>): Promise<StageResult>;
}
