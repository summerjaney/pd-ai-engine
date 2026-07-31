import type { LlmGenerationRequest, LlmGenerationResponse, LlmProvider, LlmProviderInfo } from "./types.js";

export class MockLlmProvider implements LlmProvider {
  constructor(private readonly model = "pae-mock-0.4.0") {}

  async generate(request: Readonly<LlmGenerationRequest>): Promise<LlmGenerationResponse> {
    return {
      content: `# 需求分析\n\n## 产品目标\n\n基于输入需求完成 ${request.stage} 阶段分析。\n\n## 待确认项\n\n- 本结果由 Mock Provider 生成。`,
      model: request.model ?? this.model,
      provider: "mock",
    };
  }

  modelInfo(): LlmProviderInfo {
    return { id: "mock", model: this.model };
  }

  async healthCheck(): Promise<void> {}
}
