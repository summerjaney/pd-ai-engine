export type MasterGoOperationType = "create-page" | "create-frame" | "create-node";

export interface MasterGoOperation {
  id: string;
  type: MasterGoOperationType;
  sourceId: string;
  parentOperationId?: string;
  name: string;
  payload: Record<string, unknown>;
}

export interface MasterGoOperationPlan {
  schemaVersion: "0.1";
  generatedAt: string;
  source: string;
  summary: {
    pages: number;
    frames: number;
    nodes: number;
    totalOperations: number;
  };
  operations: MasterGoOperation[];
  warnings: string[];
}

export interface MasterGoNodeMapping {
  sourceId: string;
  masterGoNodeId: string;
  operationId: string;
}

export interface MasterGoExecutionResult {
  schemaVersion: "0.1";
  status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "DRY_RUN";
  startedAt: string;
  completedAt: string;
  totalOperations: number;
  completedOperations: number;
  mappings: MasterGoNodeMapping[];
  warnings: string[];
  errors: string[];
}
