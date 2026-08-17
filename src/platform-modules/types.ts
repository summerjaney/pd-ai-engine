export const PLATFORM_MODULE_DEPENDENCY_TYPES = ["data", "permission", "configuration", "lifecycle", "integration"] as const;
export type PlatformModuleDependencyType = (typeof PLATFORM_MODULE_DEPENDENCY_TYPES)[number];

export interface PlatformModuleDependency {
  moduleId: string;
  type: PlatformModuleDependencyType;
  description: string;
  required: boolean;
}

export interface PlatformModule {
  id: string;
  name: string;
  description: string;
  version: string;
  status: "confirmed" | "draft" | "deprecated";
  responsibilities: string[];
  coreObjects: string[];
  capabilities: string[];
  dependencies: PlatformModuleDependency[];
  extensionPoints: string[];
  source: { document: string; section?: string };
}

export interface PlatformModuleCatalogFile {
  schemaVersion: "1.6";
  version: string;
  productId: string;
  entries: string[];
}

export interface PlatformModuleCatalog {
  schemaVersion: "1.6";
  version: string;
  productId: string;
  modules: PlatformModule[];
  byId: ReadonlyMap<string, PlatformModule>;
}

export interface PlatformModuleGraph {
  schemaVersion: "1.6";
  productId: string;
  catalogVersion: string;
  nodes: Array<{ id: string; name: string; version: string; status: PlatformModule["status"] }>;
  edges: Array<PlatformModuleDependency & { from: string; to: string }>;
}
