export interface AiPlanningTargetUser {
  id: string;
  name: string;
  share: number;
  goals: string[];
}

export interface AiPlanningModule {
  id: string;
  name: string;
  currentCapabilities: string[];
}

export interface AiPlanningScenario {
  id: string;
  name: string;
  description: string;
  targetUserIds: string[];
  moduleIds: string[];
  capabilities: string[];
  value: number;
  frequency: number;
  strategicFit: number;
  complexity: number;
  risk: number;
  requiresHumanConfirmation: boolean;
}

export interface AiProductPlanningInput {
  project: {
    id: string;
    name: string;
    productSystem: string[];
    objective: string;
  };
  targetUsers: AiPlanningTargetUser[];
  modules: AiPlanningModule[];
  scenarios: AiPlanningScenario[];
  constraints: {
    security: string[];
    delivery: string[];
  };
}

export interface PrioritizedAiScenario extends AiPlanningScenario {
  score: number;
  priority: "P0" | "P1" | "P2";
  recommendation: "MVP_CANDIDATE" | "ROADMAP" | "RESEARCH";
}

export interface AiCapabilityBlueprintItem {
  id: string;
  name: string;
  scenarioIds: string[];
  moduleIds: string[];
}

export interface AiPlanningGate {
  schemaVersion: "2.1";
  status: "WAITING_PM_CONFIRMATION" | "CONFIRMED";
  recommendedScenarioIds: string[];
  blockers: string[];
  nextCommand: string;
}

export interface AiMvpDecision {
  schemaVersion: "2.1";
  status: "CONFIRMED";
  scenarioIds: string[];
  scope: string;
  note?: string;
  confirmedBy: "product-manager";
  confirmedAt: string;
}
