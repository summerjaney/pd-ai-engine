export const EXTENSION_SCHEMA_VERSION = "1.2" as const;

export type ExtensionType = "domain" | "product" | "workflow" | "deliverable" | "adapter";
export type ExtensionResourceType = "knowledge" | "rules" | "patterns" | "workflows" | "templates" | "terminology";

export interface ExtensionManifest {
  schemaVersion: typeof EXTENSION_SCHEMA_VERSION;
  id: string;
  name: string;
  type: ExtensionType;
  version: string;
  description?: string;
  compatibleWith: { pae: string };
  extends?: string[];
  provides: Partial<Record<ExtensionResourceType, string[]>>;
}

export interface ExtensionSource {
  extensionId: string;
  extensionVersion: string;
  extensionType: ExtensionType;
  resourceType: ExtensionResourceType;
  path: string;
}

export interface ExtensionResource<T = unknown> {
  id?: string;
  value: T;
  source: ExtensionSource;
}

export interface LoadedExtension {
  root: string;
  manifest: ExtensionManifest;
  resources: ExtensionResource[];
}

export interface ExtensionValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface ExtensionValidationResult {
  valid: boolean;
  issues: ExtensionValidationIssue[];
}

export interface ExtensionConflict {
  resourceType: ExtensionResourceType;
  resourceId: string;
  previous: ExtensionSource;
  selected: ExtensionSource;
  resolution: "more-specific-extension";
}

export interface ComposedExtensionContext {
  schemaVersion: typeof EXTENSION_SCHEMA_VERSION;
  extensions: Array<{ id: string; name: string; type: ExtensionType; version: string }>;
  resources: ExtensionResource[];
  conflicts: ExtensionConflict[];
}
