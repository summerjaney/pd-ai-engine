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
  optionsSource?: string;
}

export interface PrototypeAction {
  id: string;
  label: string;
  kind: "primary" | "secondary" | "danger";
  confirmation?: boolean;
  confirmationMessage?: string;
  roles?: string[];
}

export interface PrototypePage {
  id: string;
  name: string;
  route: string;
  pattern: "list" | "form" | "detail";
  fields: PrototypeField[];
  actions: PrototypeAction[];
  tableColumns?: string[];
  pagination?: { enabled: boolean; pageSize: number };
  emptyState?: { description: string; actionId?: string };
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
  errorFeedback?: {
    validationMessage: string;
    operationFailureMessage: string;
    recoveryAction: string;
  };
  designTokens: DesignTokens;
}

export interface PrototypeTransition {
  sourcePageId: string;
  triggerType: "navigation" | "action";
  triggerId: string;
  triggerLabel: string;
  targetPageId: string;
}

export type PageDeliveryStatus = "PLANNED" | "GENERATED" | "PREVIEWED" | "SUBMITTED" | "PENDING_VERIFICATION" | "VERIFIED" | "FAILED";

export interface RequirementPagePlan {
  schemaVersion: "0.7";
  requirementId?: string;
  pages: Array<{
    id: string;
    name: string;
    type: PrototypePage["pattern"];
    objective: string;
    route: string;
    upstreamPageIds: string[];
    downstreamPageIds: string[];
    triggerActions: string[];
    roles: string[];
    status: PageDeliveryStatus;
  }>;
}

export interface RequirementDesignContext {
  schemaVersion: "0.7";
  frame: { width: number; height: number; layout: "horizontal" | "vertical"; gap: number };
  tokens: DesignTokens;
  conventions: {
    pageHeader: boolean;
    formLabelWidth: number;
    primaryActionLimit: number;
    destructiveActionRequiresConfirmation: boolean;
  };
}

export interface RequirementInteractionMap {
  schemaVersion: "0.7";
  interactions: PrototypeTransition[];
}

export type PagePlanValidationSeverity = "error" | "warning";

export interface PagePlanValidationIssue {
  code: "DUPLICATE_PAGE_ID" | "INVALID_SOURCE_PAGE" | "INVALID_TARGET_PAGE" | "ISOLATED_PAGE" | "UNREACHABLE_PAGE" | "MISSING_FLOW_ENTRY" | "MISSING_FLOW_EXIT";
  severity: PagePlanValidationSeverity;
  message: string;
  pageId?: string;
  transitionId?: string;
}

export interface PagePlanValidationReport {
  schemaVersion: "0.7";
  valid: boolean;
  summary: { pageCount: number; interactionCount: number; errorCount: number; warningCount: number };
  entryPageIds: string[];
  exitPageIds: string[];
  issues: PagePlanValidationIssue[];
}

export type DesignConsistencySeverity = "error" | "warning";

export interface DesignConsistencyIssue {
  code: "FIELD_DEFINITION_CONFLICT" | "TOO_MANY_PRIMARY_ACTIONS" | "DANGER_ACTION_WITHOUT_CONFIRMATION" | "LIST_WITHOUT_PAGINATION" | "LIST_WITHOUT_EMPTY_STATE";
  severity: DesignConsistencySeverity;
  message: string;
  pageId?: string;
  fieldId?: string;
  actionId?: string;
}

export interface DesignConsistencyReport {
  schemaVersion: "0.7";
  valid: boolean;
  context: RequirementDesignContext;
  summary: { pageCount: number; checkedFieldCount: number; checkedActionCount: number; errorCount: number; warningCount: number };
  pages: Array<{ pageId: string; frame: RequirementDesignContext["frame"]; conventions: RequirementDesignContext["conventions"] }>;
  issues: DesignConsistencyIssue[];
}

export type InteractionConsistencySeverity = "error" | "warning";

export interface InteractionConsistencyIssue {
  code: "DUPLICATE_TRIGGER" | "CONFLICTING_TRIGGER_TARGET" | "MISSING_ACTION_TRIGGER" | "MISSING_NAVIGATION_TRIGGER" | "PLAN_RELATION_MISMATCH";
  severity: InteractionConsistencySeverity;
  message: string;
  pageId?: string;
  triggerId?: string;
}

export interface InteractionConsistencyReport {
  schemaVersion: "0.7";
  valid: boolean;
  summary: { checkedInteractionCount: number; checkedPageCount: number; errorCount: number; warningCount: number };
  issues: InteractionConsistencyIssue[];
}

export interface PrdTraceabilityItem {
  id: string;
  kind: "page" | "field" | "rule" | "acceptance-criterion";
  label: string;
  pageId?: string;
  sourceId: string;
  prdCovered: boolean;
}

export interface PrdTraceabilityReport {
  schemaVersion: "0.7";
  requirementId?: string;
  valid: boolean;
  summary: {
    pageCount: number;
    fieldCount: number;
    ruleCount: number;
    acceptanceCriteriaCount: number;
    coveredCount: number;
    missingCount: number;
  };
  items: PrdTraceabilityItem[];
}

export type DeliveryConsistencySeverity = "error" | "warning";

export interface DeliveryConsistencyIssue {
  code: "PROTOTYPE_PAGE_MISSING_IN_MASTERGO" | "MASTERGO_SCREEN_WITHOUT_PROTOTYPE" | "MASTERGO_NODE_MISMATCH" | "MASTERGO_PAGE_NOT_CREATED" | "MASTERGO_PENDING_VERIFICATION" | "PROTOTYPE_NOT_CONFIRMED" | "PRD_TRACEABILITY_GAP";
  severity: DeliveryConsistencySeverity;
  message: string;
  pageId?: string;
  sourceId?: string;
}

export interface DeliveryConsistencyReport {
  schemaVersion: "0.7";
  requirementId?: string;
  valid: boolean;
  summary: {
    prototypePageCount: number;
    mastergoScreenCount: number;
    createdPageCount: number;
    prdTraceabilityCount: number;
    errorCount: number;
    warningCount: number;
  };
  checks: {
    prototypeToMasterGo: "PASS" | "FAIL";
    masterGoSubmission: "PASS" | "FAIL" | "PENDING";
    prototypeConfirmation: "PASS" | "FAIL";
    prdTraceability: "PASS" | "FAIL";
  };
  issues: DeliveryConsistencyIssue[];
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

export type KnowledgeMode = "auto" | "off";

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
