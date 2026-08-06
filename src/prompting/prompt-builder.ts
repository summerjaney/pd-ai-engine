import type { StageId, WorkflowContext } from "../domain/types.js";
import { createStageKnowledgeTrace, type KnowledgeTrace } from "../knowledge/trace.js";
import type { KnowledgeEntity, KnowledgeType } from "../knowledge/types.js";

export const PROMPT_VERSION = "0.5.0";

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
    "JSON 必须符合下文 PrototypeDsl JSON Schema 约束，字段名、层级和引用关系必须完全一致。",
    "页面 pattern 只能是 list、form、detail；字段 type 只能是 text、textarea、select、datetime；操作 kind 只能是 primary、secondary、danger。",
  ].join("\n"),
  mastergo: "根据 Prototype DSL 生成 MasterGo 适配数据。本阶段通常由确定性适配器执行。",
  "prototype-confirmation": "记录真实原型确认状态。本阶段不得由模型代替用户作出确认。",
  prd: "输出 Markdown PRD。页面、字段、操作和跳转必须以 Prototype DSL 为准，至少包含产品目标、角色、流程、页面需求、业务规则和异常处理。",
  review: "输出 Markdown 评审报告，检查需求、Prototype DSL 与 PRD 的完整性和一致性，列出结论、问题、严重程度、位置及修复建议。",
};

const STAGE_KNOWLEDGE_TYPES: Record<StageId, readonly KnowledgeType[]> = {
  "requirement-analysis": ["business", "rule"],
  "product-outline": ["business", "rule"],
  "product-architecture": ["business", "pattern"],
  "core-flow": ["business", "pattern", "rule"],
  "page-structure": ["pattern", "component", "rule"],
  prototype: ["component", "rule"],
  mastergo: ["component", "rule"],
  "prototype-confirmation": [],
  prd: ["business", "pattern", "component", "rule"],
  review: ["business", "pattern", "component", "rule"],
};

const PROTOTYPE_DSL_SCHEMA = `# PrototypeDsl JSON Schema 约束（必须严格遵守）

只允许使用下列字段名，不得新增、改名或使用下划线/缩写变体。
禁止使用 roles、groups、items、target_page、page_id、source_page_id 等非标准字段。
navigation、transitions、rules 中的页面引用字段必须与 pages[].id 完全匹配。

## 顶层结构
- schemaVersion: 字符串，固定为 "0.2"
- product: 对象
  - name: 字符串
  - description: 字符串
  - sourceAttribution: 可选字符串
- navigation: 数组，每个元素
  - label: 字符串
  - pageId: 字符串（必须等于 pages 中某个页面的 id）
  - roles: 可选字符串数组
- pages: 非空数组，每个元素
  - id: 字符串（页面唯一标识，被 navigation.pageId / transitions.sourcePageId / transitions.targetPageId / rules.appliesTo 引用）
  - name: 字符串
  - route: 字符串
  - pattern: "list" | "form" | "detail"
  - fields: 数组，每个元素
    - id: 字符串
    - label: 字符串
    - type: "text" | "textarea" | "select" | "datetime"
    - required: 布尔
  - actions: 数组，每个元素
    - id: 字符串
    - label: 字符串
    - kind: "primary" | "secondary" | "danger"
- rules: 数组，每个元素
  - id: 字符串
  - description: 字符串
  - appliesTo: 字符串数组（每个值必须等于 pages 中某个页面的 id）
- transitions: 数组，每个元素
  - sourcePageId: 字符串（必须等于 pages 中某个页面的 id）
  - triggerType: "navigation" | "action"
  - triggerId: 字符串
  - triggerLabel: 字符串
  - targetPageId: 字符串（必须等于 pages 中某个页面的 id）
- designTokens: 对象
  - colors: 字符串键值对
  - spacing: 数值键值对
  - radius: 数值键值对
  - typography: 对象
    - fontSize: 数值键值对
    - fontWeight: 数值键值对
    - lineHeight: 数值键值对

## 命名规范
- 所有字段名使用 camelCase，不得使用 snake_case（如 page_id、target_page 均非法）。
- 不得用 roles、groups、items、children、target 等字段替代上述结构。
- 不得在 navigation、pages、transitions、rules 之外自行新增顶层字段。

## 引用一致性
- navigation[i].pageId、transitions[i].sourcePageId、transitions[i].targetPageId、rules[i].appliesTo[] 必须在 pages[].id 中存在。
- 不允许引用未定义的页面，也不允许出现空字符串或 null 引用。`;

export class PromptBuilder {
  buildStagePrompt(stage: StageId, context: Readonly<WorkflowContext>): StagePrompt {
    const previousArtifacts = STAGE_DEPENDENCIES[stage]
      .map((id) => [id, context.artifacts[id]] as const)
      .filter(([, artifact]) => artifact !== undefined)
      .map(([id, artifact]) => `## ${id}\n${this.serializeArtifact(artifact)}`)
      .join("\n\n");

    const schemaBlock = stage === "prototype" ? PROTOTYPE_DSL_SCHEMA : "";
    const knowledgeBlock = this.buildKnowledgeBlock(stage, context);

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
        knowledgeBlock,
        schemaBlock,
      ].filter(Boolean).join("\n\n"),
    };
  }

  prototypeSchemaConstraints(): string {
    return PROTOTYPE_DSL_SCHEMA;
  }

  promptVersion(): string {
    return PROMPT_VERSION;
  }

  stageKnowledgeTrace(stage: StageId, context: Readonly<WorkflowContext>): KnowledgeTrace | undefined {
    if (!context.knowledge) return undefined;
    return createStageKnowledgeTrace(
      context.knowledge.selection,
      new Set(STAGE_KNOWLEDGE_TYPES[stage]),
    );
  }

  private buildKnowledgeBlock(stage: StageId, context: Readonly<WorkflowContext>): string {
    const trace = this.stageKnowledgeTrace(stage, context);
    if (!trace?.selectedKnowledge.length || !context.knowledge) return "";
    const lines = trace.selectedKnowledge.map((selected) => {
      const entity = context.knowledge!.catalog.byId.get(selected.knowledgeId)!;
      return this.serializeKnowledge(entity);
    });
    return [
      `# 阶段知识约束（Catalog ${trace.knowledgeCatalogVersion}）`,
      "仅使用下列与当前阶段相关的知识；知识 ID 与版本必须保留用于追踪。",
      ...lines,
    ].join("\n");
  }

  private serializeKnowledge(entity: KnowledgeEntity): string {
    const base = `- [${entity.id}@${entity.version}] (${entity.type}) ${entity.name}：${entity.description}`;
    if (entity.type !== "rule") return base;
    const value = entity.assertion.value === undefined ? "" : `，值=${JSON.stringify(entity.assertion.value)}`;
    return `${base}；约束=${entity.assertion.operator} ${entity.assertion.path}${value}；严重度=${entity.severity}`;
  }

  private serializeArtifact(artifact: unknown): string {
    return typeof artifact === "string" ? artifact.trim() : JSON.stringify(artifact, null, 2);
  }
}
