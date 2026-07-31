import type { StageId, WorkflowContext } from "../domain/types.js";

export const PROMPT_VERSION = "0.4.0";

export interface StagePrompt {
  version: string;
  system: string;
  user: string;
}

const STAGE_LABELS: Record<StageId, string> = {
  "requirement-analysis": "需求分析",
  "product-outline": "产品概要设计",
  "product-architecture": "产品架构",
  "core-flow": "核心业务流程",
  "page-structure": "页面结构",
  prototype: "Prototype DSL",
  mastergo: "MasterGo 适配数据",
  "prototype-confirmation": "原型确认",
  prd: "PRD",
  review: "设计评审",
};

const STAGE_DEPENDENCIES: Record<StageId, StageId[]> = {
  "requirement-analysis": [],
  "product-outline": ["requirement-analysis"],
  "product-architecture": ["product-outline"],
  "core-flow": ["requirement-analysis", "product-outline"],
  "page-structure": ["product-outline", "core-flow"],
  prototype: ["requirement-analysis", "page-structure"],
  mastergo: ["prototype"],
  "prototype-confirmation": ["prototype", "mastergo"],
  prd: ["requirement-analysis", "product-outline", "prototype", "prototype-confirmation"],
  review: ["requirement-analysis", "prototype", "prd"],
};

const STAGE_INSTRUCTIONS: Record<StageId, string> = {
  "requirement-analysis": "输出 Markdown，至少包含产品目标、用户与任务、范围、业务规则、异常场景和待确认项。",
  "product-outline": "输出 Markdown，至少包含产品定位、业务边界、核心模块、角色职责和核心状态。",
  "product-architecture": "输出 Markdown，并使用 Mermaid flowchart 表达角色、业务模块与数据之间的关系。",
  "core-flow": "输出 Markdown，并使用 Mermaid flowchart 表达主流程、判断分支、驳回和异常路径。",
  "page-structure": "输出 Markdown，明确页面清单、页面模式、入口、主要操作及页面间关系。",
  prototype: [
    "只输出一个合法 JSON 对象，不要使用 Markdown 代码围栏或附加说明。",
    "JSON 必须符合 PrototypeDsl：schemaVersion 固定为 0.2；包含 product、navigation、pages、rules、transitions、designTokens。",
    "页面 pattern 只能是 list、form、detail；字段 type 只能是 text、textarea、select、datetime；操作 kind 只能是 primary、secondary、danger。",
  ].join("\n"),
  mastergo: "根据 Prototype DSL 生成 MasterGo 适配数据。本阶段通常由确定性适配器执行。",
  "prototype-confirmation": "记录真实原型确认状态。本阶段不得由模型代替用户作出确认。",
  prd: "输出 Markdown PRD。页面、字段、操作和跳转必须以 Prototype DSL 为准，至少包含产品目标、角色、流程、页面需求、业务规则和异常处理。",
  review: "输出 Markdown 评审报告，检查需求、Prototype DSL 与 PRD 的完整性和一致性，列出结论、问题、严重程度、位置及修复建议。",
};

export class PromptBuilder {
  buildStagePrompt(stage: StageId, context: Readonly<WorkflowContext>): StagePrompt {
    const previousArtifacts = STAGE_DEPENDENCIES[stage]
      .map((id) => [id, context.artifacts[id]] as const)
      .filter(([, artifact]) => artifact !== undefined)
      .map(([id, artifact]) => `## ${id}\n${this.serializeArtifact(artifact)}`)
      .join("\n\n");

    return {
      version: PROMPT_VERSION,
      system: [
        "你是 PAE（Product Design AI Engine）的 B 端产品设计执行器。",
        `当前阶段：${STAGE_LABELS[stage]}。`,
        "必须遵循 Prototype First：原型先于 PRD，PRD 以原型结构为依据。",
        "只输出当前阶段要求的成果物，不虚构输入中未提供的确定性事实。",
        STAGE_INSTRUCTIONS[stage],
      ].join("\n"),
      user: [
        "# 原始需求",
        context.input.content.trim(),
        previousArtifacts ? `# 前序成果物\n${previousArtifacts}` : "",
      ].filter(Boolean).join("\n\n"),
    };
  }

  promptVersion(): string {
    return PROMPT_VERSION;
  }

  private serializeArtifact(artifact: unknown): string {
    return typeof artifact === "string" ? artifact.trim() : JSON.stringify(artifact, null, 2);
  }
}
