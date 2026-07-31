import type { StageExecutor, StageId, StageResult, WorkflowContext } from "../domain/types.js";
import type { LlmProvider } from "../llm/types.js";
import { PromptBuilder } from "../prompting/prompt-builder.js";
import { OutputValidator } from "../validation/output-validator.js";

export class LlmRequirementAnalysisExecutor implements StageExecutor {
  constructor(
    private readonly provider: LlmProvider,
    private readonly fallback: StageExecutor,
    private readonly maxRetries = 1,
    private readonly timeoutMs = 60_000,
    private readonly promptBuilder = new PromptBuilder(),
    private readonly validator = new OutputValidator(),
  ) {}

  async execute(stage: StageId, context: Readonly<WorkflowContext>): Promise<StageResult> {
    if (stage !== "requirement-analysis") return this.fallback.execute(stage, context);

    const prompt = this.promptBuilder.buildStagePrompt(stage, context);
    let validationFeedback = "";
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      const response = await this.provider.generate({
        stage,
        systemPrompt: prompt.system,
        userPrompt: validationFeedback
          ? `${prompt.user}\n\n# 上次输出校验错误\n${validationFeedback}\n请修正后重新输出完整成果物。`
          : prompt.user,
        timeoutMs: this.timeoutMs,
      });
      const validation = this.validator.validateText(response.content);
      if (validation.valid) {
        return {
          stage,
          artifact: response.content.endsWith("\n") ? response.content : `${response.content}\n`,
          warnings: [],
          generationMetadata: {
            generationMode: response.provider === "mock" ? "mock" : "llm",
            provider: response.provider,
            model: response.model,
            promptVersion: prompt.version,
            generatedAt: new Date().toISOString(),
            attempts: attempt,
            validationStatus: "passed",
          },
        };
      }
      validationFeedback = this.validator.formatValidationErrors(validation);
    }
    throw new Error(`需求分析生成结果校验失败：\n${validationFeedback}`);
  }
}
