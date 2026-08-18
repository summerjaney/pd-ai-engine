import type { PlatformBoundaryPath } from "../platform-analysis/types.js";
import type { PlatformModuleDependencyType } from "../platform-modules/types.js";

export type ModuleImpactLevel = "DIRECT" | "INDIRECT" | "REGRESSION";

export interface ModuleImpactItem {
  moduleId: string;
  moduleName: string;
  level: ModuleImpactLevel;
  score: number;
  reasons: string[];
  dependencyTypes: PlatformModuleDependencyType[];
}

export interface CrossModuleImpactReport {
  schemaVersion: "1.6";
  requirement: { title: string; fingerprint: string };
  moduleCatalog: { productId: string; version: string };
  impacts: ModuleImpactItem[];
  dependencyEdges: Array<{ from: string; to: string; type: PlatformModuleDependencyType; reason: string }>;
  boundary: {
    recommendation: PlatformBoundaryPath;
    confidence: "low" | "medium" | "high";
    basis: string[];
    alternatives: PlatformBoundaryPath[];
    status: "pending-product-manager-confirmation";
    requiresHumanConfirmation: true;
  };
  unknowns: string[];
  summary: { direct: number; indirect: number; regression: number; total: number };
}
