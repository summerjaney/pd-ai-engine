import type { ProductBaselineSource } from "../product-baseline/types.js";

export type ProductChangeOperation = "ADD" | "MODIFY" | "DELETE" | "MIGRATE" | "PERMISSION_CHANGE" | "FLOW_CHANGE" | "UNRESOLVED";
export type ChangeEntityKind = "module" | "page" | "field" | "action" | "rule";
export type ConflictSeverity = "ERROR" | "WARNING" | "CONFIRMATION_REQUIRED";

export interface ProductChange {
  operation: ProductChangeOperation;
  kind: ChangeEntityKind;
  id: string;
  name: string;
  parentId?: string;
  changedProperties: string[];
  source?: ProductBaselineSource;
}

export interface ProductConflict {
  code: "DUPLICATE_ID" | "DUPLICATE_ROUTE" | "FIELD_DEFINITION_CONFLICT" | "PAGE_DEFINITION_CONFLICT" | "PERMISSION_CONFLICT" | "RULE_CONFLICT" | "UNCONFIRMED_DELETE";
  severity: ConflictSeverity;
  message: string;
  entityId: string;
}

export interface ChangeImpactReport {
  schemaVersion: "1.1";
  baseline: { sequence: number; hash: string; productVersion: string };
  requirement: { id: string; revision: number };
  summary: { add: number; modify: number; delete: number; unresolved: number; error: number; warning: number; confirmationRequired: number };
  changes: ProductChange[];
  conflicts: ProductConflict[];
  affectedArtifacts: string[];
  canProceed: boolean;
}
