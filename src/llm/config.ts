import type { LlmProviderId } from "./types.js";

export interface LlmConfig {
  provider: LlmProviderId;
  model: string;
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

export interface LlmConfigOverrides {
  provider?: string;
  model?: string;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || (name === "PAE_LLM_TIMEOUT" && parsed === 0)) {
    throw new Error(`${name} 必须是${name === "PAE_LLM_TIMEOUT" ? "大于 0" : "大于等于 0"}的整数。`);
  }
  return parsed;
}

export function loadLlmConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: LlmConfigOverrides = {},
): LlmConfig {
  const provider = overrides.provider ?? env.PAE_LLM_PROVIDER ?? "mock";
  if (provider !== "mock" && provider !== "openai") {
    throw new Error(`不支持的 LLM Provider：${provider}`);
  }

  const model = overrides.model ?? env.PAE_LLM_MODEL ?? (provider === "mock" ? "pae-mock-0.4.0" : "");
  if (!model.trim()) throw new Error("使用 openai Provider 时必须通过 --model 或 PAE_LLM_MODEL 指定模型。");

  const apiKey = env.PAE_LLM_API_KEY?.trim();
  if (provider === "openai" && !apiKey) {
    throw new Error("使用 openai Provider 时必须设置 PAE_LLM_API_KEY。");
  }

  return {
    provider,
    model: model.trim(),
    apiKey,
    baseUrl: (env.PAE_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    timeoutMs: positiveInteger(env.PAE_LLM_TIMEOUT, 60_000, "PAE_LLM_TIMEOUT"),
    maxRetries: positiveInteger(env.PAE_LLM_MAX_RETRIES, 1, "PAE_LLM_MAX_RETRIES"),
  };
}
