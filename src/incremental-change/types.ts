import type { CrossModuleImpactReport } from "../cross-module-impact/types.js";
import type { DesignUnit, DesignUnitPlan } from "../design-units/types.js";

export interface RequirementDesignSnapshot {
  schemaVersion: "1.6";
  sequence: number;
  capturedAt: string;
  requirement: { title: string; fingerprint: string; contentHash: string };
  impactReport: CrossModuleImpactReport;
  designUnitPlan: DesignUnitPlan;
}

export interface IncrementalDesignUnitPlan {
  schemaVersion: "1.6";
  status: "pending-solution-reconfirmation" | "unchanged";
  previousSnapshotSequence: number;
  requirementFingerprint: string;
  preservedUnits: DesignUnit[];
  recomputedUnits: DesignUnit[];
  removedUnitIds: string[];
  units: DesignUnit[];
}

export interface RequirementChangeReport {
  schemaVersion: "1.6";
  status: "NO_CHANGE" | "CHANGE_DETECTED";
  baselineSequence: number;
  previousRequirementFingerprint: string;
  currentRequirementFingerprint: string;
  moduleChanges: Array<{ moduleId: string; moduleName: string; operation: "ADDED" | "MODIFIED" | "REMOVED" }>;
  affectedModuleIds: string[];
  preservedUnitIds: string[];
  recomputedUnitIds: string[];
  removedUnitIds: string[];
  invalidatedConfirmations: string[];
  incrementalPlan: IncrementalDesignUnitPlan;
  summary: { addedModules: number; modifiedModules: number; removedModules: number; affectedUnits: number; preservedUnits: number };
}
