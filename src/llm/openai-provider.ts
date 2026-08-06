import type { LlmGenerationRequest, LlmGenerationResponse, LlmProvider, LlmProviderInfo } from "./types.js";

interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAiProvider implements LlmProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiProviderOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async generate(request: Readonly<LlmGenerationRequest>): Promise<LlmGenerationResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? this.options.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model ?? this.options.model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      const payload = await response.json() as ChatCompletionResponse;
      if (!response.ok) {
        const category = response.status === 401 || response.status === 403
          ? "鉴权失败"
          : response.status === 429
            ? "请求限流"
            : "调用失败";
        throw new Error(`OpenAI ${category}（HTTP ${response.status}）：${payload.error?.message ?? "未知错误"}`);
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("OpenAI 返回了无效响应：缺少消息内容。");
      }
      return {
        content,
        model: payload.model ?? request.model ?? this.options.model,
        provider: "openai",
        usage: {
          inputTokens: payload.usage?.prompt_tokens,
          outputTokens: payload.usage?.completion_tokens,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`OpenAI 调用超时（${request.timeoutMs ?? this.options.timeoutMs}ms）。`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  modelInfo(): LlmProviderInfo {
    return { id: "openai", model: this.options.model };
  }

  async healthCheck(): Promise<void> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/models`, {
      headers: { authorization: `Bearer ${this.options.apiKey}` },
    });
    if (!response.ok) throw new Error(`OpenAI 健康检查失败（HTTP ${response.status}）。`);
  }
}
