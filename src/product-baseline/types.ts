export const PRODUCT_BASELINE_SCHEMA_VERSION = "1.1" as const;

export interface ProductBaselineSource {
  requirementId: string;
  requirementRevision: number;
  artifact: string;
}

export interface ProductBaselineField {
  id: string;
  name: string;
  type: "text" | "textarea" | "select" | "datetime";
  required: boolean;
  source: ProductBaselineSource;
}

export interface ProductBaselinePage {
  id: string;
  name: string;
  route: string;
  pattern: "list" | "form" | "detail";
  roles: string[];
  fields: ProductBaselineField[];
  actions: Array<{
    id: string;
    name: string;
    kind: "primary" | "secondary" | "danger";
    roles: string[];
    source: ProductBaselineSource;
  }>;
  source: ProductBaselineSource;
}

export interface ProductBaseline {
  schemaVersion: typeof PRODUCT_BASELINE_SCHEMA_VERSION;
  project: {
    id: string;
    name: string;
  };
  product: {
    name: string;
    description: string;
    version: string;
  };
  baseline: {
    sequence: number;
    status: "accepted";
    createdAt: string;
    updatedAt: string;
    hash: string;
  };
  requirements: Array<{
    id: string;
    name: string;
    revision: number;
    productVersion: string;
    acceptedAt: string;
  }>;
  modules: Array<{
    id: string;
    name: string;
    entryPageId: string;
    roles: string[];
    source: ProductBaselineSource;
  }>;
  pages: ProductBaselinePage[];
  rules: Array<{
    id: string;
    description: string;
    appliesTo: string[];
    source: ProductBaselineSource;
  }>;
}

export interface ProductBaselineValidationIssue {
  path: string;
  message: string;
}

export interface ProductBaselineValidationResult {
  valid: boolean;
  issues: ProductBaselineValidationIssue[];
}

export interface ProductBaselineAcceptanceResult {
  previousSequence: number;
  sequence: number;
  baselinePath: string;
  snapshotPath: string;
  updatedArtifacts: string[];
}
