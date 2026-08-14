import type { ExtensionSource } from "../extensions/types.js";

export const PLATFORM_ANALYSIS_SCHEMA_VERSION = "1.2" as const;

export type PlatformBoundaryPath = "configuration" | "platform-enhancement" | "platform-capability" | "project-customization" | "project-validation" | "architecture-assessment";

export interface PlatformCapabilityMatch {
  id: string;
  name: string;
  module?: string;
  status?: string;
  score: number;
  source: ExtensionSource;
}

export interface PlatformAnalysisReport {
  schemaVersion: typeof PLATFORM_ANALYSIS_SCHEMA_VERSION;
  requirement: { title: string; fingerprint: string };
  context: { extensions: Array<{ id: string; version: string }> };
  currentState: {
    affectedModules: string[];
    matchedCapabilities: PlatformCapabilityMatch[];
    applicableRules: Array<{ id: string; name: string; source: ExtensionSource }>;
  };
  gap: {
    summary: string;
    existingCapabilityCount: number;
    unknowns: string[];
  };
  boundaryAssessment: {
    recommendation: PlatformBoundaryPath;
    confidence: "low" | "medium";
    basis: string[];
    alternatives: PlatformBoundaryPath[];
    status: "pending-human-confirmation";
    requiresHumanConfirmation: true;
  };
}
