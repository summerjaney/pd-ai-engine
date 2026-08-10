export interface ManualSourceReference {
  kind: "requirement" | "prototype-page" | "prototype-field" | "prototype-action" | "prototype-rule" | "prototype-transition" | "prd";
  sourceId: string;
}

export interface ProductManual {
  schemaVersion: "0.8";
  requirementId?: string;
  title: string;
  product: { name: string; description: string };
  roles: Array<{ name: string; pageIds: string[] }>;
  modules: Array<{
    id: string;
    name: string;
    route: string;
    purpose: string;
    fields: Array<{ id: string; label: string; required: boolean }>;
    actions: Array<{ id: string; label: string; kind: string; confirmation: boolean; roles: string[] }>;
    manualNotes?: string;
    sourceReferences: ManualSourceReference[];
  }>;
  rules: Array<{ id: string; description: string; appliesTo: string[]; manualNotes?: string; sourceReferences: ManualSourceReference[] }>;
}

export interface OperationManual {
  schemaVersion: "0.8";
  requirementId?: string;
  title: string;
  roleGuides: Array<{
    role: string;
    operations: Array<{
      id: string;
      title: string;
      entryPageId: string;
      preconditions: string[];
      steps: Array<{ order: number; pageId: string; actionId: string; instruction: string; targetPageId?: string }>;
      expectedResult: string;
      failureHandling?: string;
      manualNotes?: string;
      sourceReferences: ManualSourceReference[];
    }>;
  }>;
}

export interface ManualGenerationState {
  schemaVersion: "0.8";
  requirementId?: string;
  revision?: number;
  sourceFingerprints: Record<string, string>;
}

export interface ManualImpactReport {
  schemaVersion: "0.8";
  requirementId?: string;
  previousRevision?: number;
  currentRevision?: number;
  changed: boolean;
  impact: {
    added: string[];
    modified: string[];
    removed: string[];
  };
  preservedManualNotes: string[];
}

export interface ManualTraceabilityMatrix {
  schemaVersion: "0.8";
  requirementId?: string;
  items: Array<{
    sourceKind: ManualSourceReference["kind"];
    sourceId: string;
    productManualSectionIds: string[];
    operationIds: string[];
  }>;
  summary: { sourceCount: number; coveredCount: number; missingCount: number; coverageRate: number };
}

export type ManualConsistencySeverity = "error" | "warning";

export interface ManualConsistencyIssue {
  code:
    | "MISSING_PAGE"
    | "UNKNOWN_PAGE"
    | "MISSING_FIELD"
    | "UNKNOWN_FIELD"
    | "MISSING_ACTION"
    | "UNKNOWN_ACTION"
    | "ROLE_ACCESS_MISMATCH"
    | "INVALID_OPERATION_STEP"
    | "INVALID_TRANSITION"
    | "MISSING_RULE"
    | "UNKNOWN_RULE"
    | "TRACEABILITY_GAP";
  severity: ManualConsistencySeverity;
  message: string;
  sourceId?: string;
}

export interface ManualConsistencyReport {
  schemaVersion: "0.8";
  requirementId?: string;
  valid: boolean;
  summary: {
    pageCount: number;
    fieldCount: number;
    actionCount: number;
    ruleCount: number;
    operationCount: number;
    errorCount: number;
    warningCount: number;
  };
  checks: {
    pageCoverage: "PASS" | "FAIL";
    fieldAndActionConsistency: "PASS" | "FAIL";
    roleAccessConsistency: "PASS" | "FAIL";
    operationPathConsistency: "PASS" | "FAIL";
    ruleConsistency: "PASS" | "FAIL";
    traceability: "PASS" | "FAIL";
  };
  issues: ManualConsistencyIssue[];
}
