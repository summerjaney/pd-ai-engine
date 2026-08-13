import type { ProductBaselineSource } from "../product-baseline/types.js";

export const PRODUCT_CONTEXT_SCHEMA_VERSION = "1.1" as const;

export interface ProductContextReference {
  kind: "module" | "page" | "field" | "action" | "rule";
  id: string;
  name: string;
  parentId?: string;
  score: number;
  source: ProductBaselineSource;
}

export interface ProductContextSelection {
  schemaVersion: typeof PRODUCT_CONTEXT_SCHEMA_VERSION;
  baseline: {
    projectId: string;
    productVersion: string;
    sequence: number;
    hash: string;
  };
  query: {
    requirementId?: string;
    requirementRevision?: number;
    fingerprint: string;
  };
  selected: ProductContextReference[];
  omittedCount: number;
}
