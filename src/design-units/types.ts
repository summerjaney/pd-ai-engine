import type { ModuleImpactLevel } from "../cross-module-impact/types.js";
import type { SolutionOptionId } from "../solution-options/types.js";

export const DESIGN_UNIT_KINDS = ["capability", "data-model", "permission", "page", "workflow", "interface", "configuration", "migration", "regression"] as const;
export type DesignUnitKind = (typeof DESIGN_UNIT_KINDS)[number];

export interface DesignUnit {
  id: string;
  kind: DesignUnitKind;
  name: string;
  moduleId: string;
  moduleName: string;
  impactLevel: ModuleImpactLevel;
  description: string;
  sourceReasons: string[];
  expectedArtifacts: string[];
  status: "planned";
}

export interface DesignUnitPlan {
  schemaVersion: "1.6";
  requirementFingerprint: string;
  impactReportHash: string;
  solutionComparisonHash: string;
  selectedOptionId: SolutionOptionId;
  solutionScope: string;
  generatedAt: string;
  units: DesignUnit[];
}

export interface DesignUnitTraceabilityReport {
  schemaVersion: "1.6";
  valid: boolean;
  planFingerprint: string;
  checks: Array<{ unitId: string; artifact: string; status: "PASS" | "MISSING_ARTIFACT" | "MISSING_REFERENCE" }>;
  summary: { unitCount: number; expectedReferenceCount: number; coveredReferenceCount: number; missingArtifactCount: number; missingReferenceCount: number };
}
