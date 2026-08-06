import type { StageId } from "../domain/types.js";

export type LlmProviderId = "mock" | "openai";

export interface LlmGenerationRequest {
  stage: StageId;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  timeoutMs?: number;
}

export interface LlmGenerationUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmGenerationResponse {
  content: string;
  model: string;
  provider: LlmProviderId;
  usage?: LlmGenerationUsage;
}

export interface LlmProviderInfo {
  id: LlmProviderId;
  model: string;
}

export interface LlmProvider {
  generate(request: Readonly<LlmGenerationRequest>): Promise<LlmGenerationResponse>;
  modelInfo(): LlmProviderInfo;
  healthCheck(): Promise<void>;
}

export interface GenerationMetadata {
  generationMode: "mock" | "llm";
  provider: LlmProviderId;
  model: string;
  promptVersion: string;
  generatedAt: string;
  attempts: number;
  validationStatus: "passed" | "failed";
}
