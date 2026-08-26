export type LowCodeModuleId = "application" | "entity" | "form" | "workflow" | "permission";
export type LowCodeFieldType = "text" | "number" | "textarea" | "user" | "department" | "datetime";

export interface LowCodeDslBundle {
  schemaVersion: "2.1";
  taskId: string;
  planConfirmed: boolean;
  targetApplication: { id: string; name: string; description: string; menus: Array<{ id: string; name: string; targetId: string }> };
  entities: Array<{ id: string; name: string; fields: Array<{ id: string; name: string; type: LowCodeFieldType; required: boolean }> }>;
  forms: Array<{ id: string; name: string; entityId: string; fieldIds: string[] }>;
  workflows: Array<{
    id: string;
    name: string;
    entityId: string;
    nodes: Array<{ id: string; name: string; type: "start" | "approval" | "end"; assignee?: string }>;
    transitions: Array<{ id: string; sourceId: string; targetId: string; condition?: string }>;
  }>;
  permissions: Array<{ roleId: string; roleName: string; objectIds: string[]; operations: Array<"create" | "read" | "update" | "delete" | "publish"> }>;
  publish: { targetEnvironment: string; requiresConfirmation: boolean; rollbackFromVersion: string };
}

export interface AiConfigValidationIssue {
  code: string;
  severity: "BLOCKER" | "ERROR" | "WARNING";
  module: LowCodeModuleId;
  objectId?: string;
  message: string;
  remediation: string;
}

export interface AiConfigValidationReport {
  schemaVersion: "2.1";
  status: "PASS" | "FAIL";
  checks: Array<{ id: string; status: "PASS" | "FAIL"; message: string }>;
  issues: AiConfigValidationIssue[];
  validatedModules: LowCodeModuleId[];
}

export interface AiRegenerationPlan {
  schemaVersion: "2.1";
  status: "REGENERATION_REQUIRED";
  regenerateModules: LowCodeModuleId[];
  preservedModules: LowCodeModuleId[];
  reasons: Array<{ module: LowCodeModuleId; issueCodes: string[] }>;
  requiresPlanReconfirmation: boolean;
}

export interface AiPublishPlan {
  schemaVersion: "2.1";
  status: "WAITING_PUBLISH_CONFIRMATION";
  targetEnvironment: string;
  modules: LowCodeModuleId[];
  orderedOperations: string[];
  preconditions: string[];
  rollback: { snapshotRequired: true; fromVersion: string; strategy: string; auditRequired: true };
}
