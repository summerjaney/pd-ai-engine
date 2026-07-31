import type {
  PrototypeDsl,
  StageExecutor,
  StageId,
  StageResult,
  WorkflowContext,
} from "../domain/types.js";
import type { LlmProvider } from "../llm/types.js";
import { PromptBuilder } from "../prompting/prompt-builder.js";
import { OutputValidator } from "../validation/output-validator.js";

const DETERMINISTIC_STAGES = new Set<StageId>([
  "mastergo",
  "prototype-confirmation",
]);

export class LlmWorkflowExecutor implements StageExecutor {
  constructor(
    private readonly provider: LlmProvider,
    private readonly fallback: StageExecutor,
    private readonly maxRetries = 1,
    private readonly timeoutMs = 60_000,
    private readonly promptBuilder = new PromptBuilder(),
    private readonly validator = new OutputValidator(),
  ) {}

  async execute(stage: StageId, context: Readonly<WorkflowContext>): Promise<StageResult> {
    const dependencyValidation = this.validator.validateDependencies(stage, context);
    if (!dependencyValidation.valid) {
      throw new Error(this.validator.formatValidationErrors(dependencyValidation));
    }

    const providerInfo = this.provider.modelInfo();
    if (providerInfo.id === "mock" || DETERMINISTIC_STAGES.has(stage)) {
      const result = await this.fallback.execute(stage, context);
      return {
        ...result,
        generationMetadata: {
          generationMode: providerInfo.id === "mock" ? "mock" : "llm",
          provider: providerInfo.id,
          model: providerInfo.model,
          promptVersion: this.promptBuilder.promptVersion(),
          generatedAt: new Date().toISOString(),
          attempts: 1,
          validationStatus: "passed",
        },
      };
    }

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

      const parsed = this.parseArtifact(stage, response.content);
      const validation = parsed.error
        ? { valid: false, issues: [{ code: "invalid-structure" as const, message: parsed.error }] }
        : stage === "prototype"
          ? this.validatePrototypeArtifact(
              parsed.artifact as PrototypeDsl,
              context.artifacts["page-structure"],
            )
          : stage === "prd"
            ? this.mergeValidationResults(
                this.validator.validateText(parsed.artifact as string),
                this.validator.validatePrdAgainstPrototype(
                  parsed.artifact as string,
                  context.artifacts.prototype!,
                ),
              )
            : this.validator.validateText(parsed.artifact as string);

      if (validation.valid) {
        const artifact = typeof parsed.artifact === "string" && !parsed.artifact.endsWith("\n")
          ? `${parsed.artifact}\n`
          : parsed.artifact!;
        return {
          stage,
          artifact,
          warnings: [],
          generationMetadata: {
            generationMode: "llm",
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

    throw new Error(`${stage} 生成结果校验失败：\n${validationFeedback}`);
  }

  private parseArtifact(stage: StageId, content: string): { artifact?: string | PrototypeDsl; error?: string } {
    if (stage !== "prototype") return { artifact: content };
    try {
      const normalized = content.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      return { artifact: JSON.parse(normalized) as PrototypeDsl };
    } catch {
      return { error: "Prototype DSL 不是合法 JSON。" };
    }
  }

  private mergeValidationResults(
    ...results: Array<ReturnType<OutputValidator["validateText"]>>
  ): ReturnType<OutputValidator["validateText"]> {
    const issues = results.flatMap((result) => result.issues);
    return { valid: issues.length === 0, issues };
  }

  private validatePrototypeArtifact(
    prototype: PrototypeDsl,
    pageStructure: string | undefined,
  ): ReturnType<OutputValidator["validatePrototype"]> {
    const structure = this.validator.validatePrototype(prototype);
    if (!structure.valid) return structure;
    return this.mergeValidationResults(
      structure,
      this.validator.validatePrototypeAgainstPageStructure(prototype, pageStructure),
    );
  }
}
