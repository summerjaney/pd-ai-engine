export interface AiBusinessObjectInput {
  id: string;
  name: string;
  description: string;
  keyFields: string[];
}

export interface AiFlowStepInput {
  id: string;
  name: string;
  actor: string;
  input: string;
  output: string;
  requiresConfirmation: boolean;
}

export interface AiExceptionInput {
  id: string;
  trigger: string;
  handling: string;
  recoverable: boolean;
}

export interface AiRequirementDesignInput {
  scenarioId: string;
  title: string;
  problem: string;
  targetOutcome: string;
  actors: Array<{ id: string; name: string; responsibility: string }>;
  businessObjects: AiBusinessObjectInput[];
  flow: AiFlowStepInput[];
  states: Array<{ id: string; name: string; terminal: boolean }>;
  exceptions: AiExceptionInput[];
  validationCase: {
    name: string;
    prompt: string;
    expectedArtifacts: string[];
  };
  acceptanceCriteria: Array<{ id: string; description: string }>;
}

export interface AiRequirementDesignManifest {
  schemaVersion: "2.1";
  scenarioId: string;
  requirementId: string;
  requirementName: string;
  productVersion: string;
  status: "READY_FOR_DETAILED_DESIGN";
  artifacts: Array<{ id: string; path: string }>;
  guardrails: string[];
  reservedManualValidation: string[];
}
