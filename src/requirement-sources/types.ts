export const REQUIREMENT_SOURCE_INDEX_SCHEMA_VERSION = "1.3" as const;

export type RequirementSourceType = "requirement" | "interview" | "meeting-note" | "screenshot" | "existing-feature" | "prd" | "prototype" | "other";
export type RequirementSourceSensitivity = "public" | "internal" | "confidential";

export interface RequirementSourceRecord {
  id: string;
  label: string;
  type: RequirementSourceType;
  sensitivity: RequirementSourceSensitivity;
  storedPath: string;
  originalName: string;
  mediaType: string;
  size: number;
  sha256: string;
  includeInAnalysis: boolean;
  addedAt: string;
}

export interface RequirementSourceIndex {
  schemaVersion: typeof REQUIREMENT_SOURCE_INDEX_SCHEMA_VERSION;
  updatedAt: string;
  sources: RequirementSourceRecord[];
}
