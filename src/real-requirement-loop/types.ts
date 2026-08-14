export const REAL_REQUIREMENT_LOOP_SCHEMA_VERSION = "1.3" as const;

export type RealRequirementGateId = "platform" | "requirement" | "solution" | "prototype" | "prd";
export type RealRequirementGateStatus = "CONFIRMED" | "READY" | "WAITING" | "INVALIDATED";

export interface RealRequirementGate {
  id: RealRequirementGateId;
  name: string;
  status: RealRequirementGateStatus;
  artifacts: string[];
  blockers: string[];
  confirmedAt?: string;
}

export interface RealRequirementLoopReport {
  schemaVersion: typeof REAL_REQUIREMENT_LOOP_SCHEMA_VERSION;
  generatedAt: string;
  requirementDirectory: string;
  status: "READY_FOR_DEVELOPMENT_REVIEW" | "IN_PROGRESS";
  currentGate?: RealRequirementGateId;
  summary: { confirmed: number; total: number; blockerCount: number };
  gates: RealRequirementGate[];
}

export interface DesignGateConfirmation {
  schemaVersion: typeof REAL_REQUIREMENT_LOOP_SCHEMA_VERSION;
  gate: "requirement" | "solution" | "prd";
  status: "confirmed";
  artifactHash: string;
  note?: string;
  confirmedAt: string;
  confirmedBy: "product-manager";
}
