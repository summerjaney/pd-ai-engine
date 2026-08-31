import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrototypeDsl } from "../domain/types.js";
import type { LowCodeDslBundle } from "../ai-config-contract/types.js";
import type { AiRequirementDesignInput, AiRequirementDesignManifest } from "../ai-requirement-design/types.js";
import type { AiDeliveryTraceItem, AiDeliveryValidationReport, AiProjectValidationReport } from "./types.js";

const writeJson = async (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

function renderPrd(input: AiRequirementDesignInput, prototype: PrototypeDsl, dsl: LowCodeDslBundle): string {
  const pages = prototype.pages.map((page) => `### ${page.name}\n\n- 页面 ID：${page.id}\n- 路由：${page.route}\n- 字段：${page.fields.map((field) => field.label).join("、")}\n- 操作：${page.actions.map((action) => `${action.label}${action.confirmation ? "（显式确认）" : ""}`).join("、")}`).join("\n\n");
  return `# ${input.title} PRD\n\n## 1. 产品目标\n\n${input.problem}\n\n目标：${input.targetOutcome}\n\n## 2. 用户与职责\n\n${input.actors.map((actor) => `- **${actor.name}**：${actor.responsibility}`).join("\n")}\n\n## 3. 端到端流程\n\n${input.flow.map((step, index) => `${index + 1}. **${step.name}**：${step.input} → ${step.output}${step.requiresConfirmation ? "；必须人工确认" : ""}`).join("\n")}\n\n## 4. 页面需求\n\n${pages}\n\n## 5. 产品规则\n\n${prototype.rules.map((rule) => `- **${rule.id}**：${rule.description}`).join("\n")}\n\n## 6. 低代码配置契约\n\n- Schema：${dsl.schemaVersion}\n- 应用：${dsl.targetApplication.name}\n- 模块：application、entity、form、workflow、permission\n- 实体：${dsl.entities.map((item) => item.name).join("、")}\n- 表单：${dsl.forms.map((item) => item.name).join("、")}\n- 流程：${dsl.workflows.map((item) => item.name).join("、")}\n- 发布：必须人工确认，并以 ${dsl.publish.rollbackFromVersion} 为回滚基线。\n\n## 7. 异常与恢复\n\n${input.exceptions.map((item) => `- **${item.id}**：${item.trigger}；${item.handling}`).join("\n")}\n\n## 8. 验收标准\n\n${input.acceptanceCriteria.map((item) => `- **${item.id}**：${item.description}`).join("\n")}\n\n## 9. 非功能与治理要求\n\n- AI 生成不得绕过平台权限、结构校验与发布确认。\n- 校验失败只重新生成受影响模块，保留已通过模块。\n- 发布前必须展示差异、建立快照；失败即停止并整体回滚。\n- 需求来源、用户确认、配置版本、发布与回滚必须可审计。\n`;
}

function buildTraceability(input: AiRequirementDesignInput, prototype: PrototypeDsl): AiDeliveryTraceItem[] {
  const map: Record<string, { pages: string[]; modules: string[] }> = {
    "AC-01": { pages: ["requirement-input", "requirement-clarification", "entity-design"], modules: ["entity", "form", "permission"] },
    "AC-02": { pages: ["workflow-design", "app-preview"], modules: ["workflow"] },
    "AC-03": { pages: ["requirement-clarification", "plan-overview", "publish-confirm"], modules: ["application"] },
    "AC-04": { pages: ["generation-progress", "validation-results"], modules: ["application", "entity", "form", "workflow", "permission"] },
    "AC-05": { pages: ["validation-results", "generation-progress"], modules: ["entity", "form", "workflow", "permission"] },
    "AC-06": { pages: ["app-preview", "publish-confirm"], modules: ["application", "form", "workflow", "permission"] },
    "AC-07": { pages: ["publish-confirm", "publish-result", "version-history"], modules: ["application", "permission"] },
    "AC-08": { pages: ["generation-progress", "validation-results", "publish-result", "version-history"], modules: ["application", "entity", "form", "workflow", "permission"] },
  };
  const pageIds = new Set(prototype.pages.map((page) => page.id));
  return input.acceptanceCriteria.map((criterion) => {
    const linked = map[criterion.id] ?? { pages: [], modules: [] };
    const status = linked.pages.length > 0 && linked.modules.length > 0 && linked.pages.every((id) => pageIds.has(id)) ? "PASS" as const : "FAIL" as const;
    return { id: `TRACE-${criterion.id}`, requirementId: input.scenarioId, pageIds: linked.pages, dslModules: linked.modules, acceptanceCriterionId: criterion.id, status };
  });
}

function renderTraceability(items: AiDeliveryTraceItem[]): string {
  return `# 需求—页面—DSL—验收标准追踪矩阵\n\n| 追踪 ID | 需求 | 页面 | DSL 模块 | 验收标准 | 状态 |\n|---|---|---|---|---|---|\n${items.map((item) => `| ${item.id} | ${item.requirementId} | ${item.pageIds.join("、")} | ${item.dslModules.join("、")} | ${item.acceptanceCriterionId} | ${item.status} |`).join("\n")}\n`;
}

export class AiProductDeliveryService {
  async finalize(requirementDirectory: string): Promise<{ report: AiDeliveryValidationReport; directory: string; files: string[] }> {
    const root = path.resolve(requirementDirectory);
    const manifest = await readJson<AiRequirementDesignManifest>(path.join(root, "00-ai-design-brief", "design-manifest.json"));
    const input = await readJson<AiRequirementDesignInput>(path.join(root, "00-ai-design-brief", "design-brief.json"));
    const configReport = await readJson<{ status: string }>(path.join(root, "05-ai-config-contract", "validation-report.json"));
    const dsl = await readJson<LowCodeDslBundle>(path.join(root, "05-ai-config-contract", "lowcode-dsl.json"));
    const prototype = await readJson<PrototypeDsl>(path.join(root, "06-prototype", "prototype.json"));
    if (manifest.status !== "READY_FOR_DETAILED_DESIGN" || configReport.status !== "PASS") throw new Error("需求设计包或低代码 DSL 契约未通过，不能生成评审交付包。");
    const checks = await Promise.all(["page-plan-validation.json", "design-consistency.json", "interaction-consistency.json"].map(async (file) => readJson<{ valid: boolean }>(path.join(root, "04-page-structure", file))));
    if (checks.some((item) => !item.valid)) throw new Error("页面、设计或交互一致性未通过，不能生成评审交付包。");

    const directory = path.join(root, "09-ai-product-delivery");
    await mkdir(directory, { recursive: true });
    const prd = renderPrd(input, prototype, dsl);
    const traceability = buildTraceability(input, prototype);
    const passed = traceability.filter((item) => item.status === "PASS").length;
    const machineChecks: AiDeliveryValidationReport["checks"] = [
      { id: "requirement-design", status: "PASS", evidence: "00-ai-design-brief/design-manifest.json" },
      { id: "dsl-contract", status: "PASS", evidence: "05-ai-config-contract/validation-report.json" },
      { id: "prototype-consistency", status: "PASS", evidence: "04-page-structure/*-consistency.json" },
      { id: "traceability", status: passed === traceability.length ? "PASS" : "FAIL", evidence: "traceability.json" },
    ];
    const manualReviewItems = ["公司真实平台资料与产品边界评审", "真实 LLM 生成质量验证", "MasterGo 真实画布核验", "研发、设计和业务评审结论"];
    const report: AiDeliveryValidationReport = { schemaVersion: "2.1", status: machineChecks.every((item) => item.status === "PASS") ? "READY_FOR_HUMAN_REVIEW" : "FAIL", checks: machineChecks, traceability: { total: traceability.length, passed, missing: traceability.length - passed }, manualReviewItems };
    if (report.status === "FAIL") throw new Error("需求—页面—DSL—验收标准追踪不完整，不能生成评审交付包。");
    const validation: AiProjectValidationReport = {
      schemaVersion: "2.1", project: "low-code-ai-app-builder", status: "READY_FOR_HUMAN_REVIEW",
      generatedArtifacts: ["AI 能力规划", "标准需求设计包", "低代码 DSL 契约", "14 页产品原型", "PRD", "评审包"],
      validatedCapabilities: ["真实项目建档", "MVP 人工决策门禁", "需求建模", "DSL 校验与局部重生成", "产品原型与一致性校验", "端到端追踪"],
      retainedHumanResponsibilities: manualReviewItems,
      knowledgeCandidates: ["AI 负责理解和生成、低代码引擎负责校验和执行、用户负责最终确认", "整包生成、分模块校验、局部修复、整体发布", "高风险发布必须差异预览、快照、确认、审计和回滚"],
    };
    const review = `# AI 应用搭建助手设计评审包\n\n- 评审状态：${report.status}\n- 产品范围：自然语言生成采购审批应用的应用、实体、表单、流程与权限草案\n- 页面：${prototype.pages.length}\n- DSL 模块：5\n- 验收标准追踪：${passed}/${traceability.length}\n\n## 建议评审顺序\n\n1. 产品目标、目标用户和 MVP 边界\n2. 需求理解、方案确认和局部重生成流程\n3. 14 个页面及关键交互\n4. 五类 DSL、权限、安全、发布和回滚规则\n5. 人工待确认事项与后续决策\n\n## 人工待确认\n\n${manualReviewItems.map((item) => `- ${item}`).join("\n")}\n`;
    const validationMd = `# PAE v2.1.0 真实项目验证报告\n\n- 状态：${validation.status}\n- 已验证能力：${validation.validatedCapabilities.join("、")}\n\n## 结论\n\nPAE 已完整生成低代码平台 AI 应用搭建助手的规划、需求、配置契约、原型和 PRD，并通过机器一致性与追踪校验；真实平台适配、模型质量、画布和跨角色评审仍须人工完成。\n\n## 知识回流候选\n\n${validation.knowledgeCandidates.map((item) => `- ${item}`).join("\n")}\n`;
    const files = ["prd.md", "traceability.json", "traceability.md", "review-package.md", "delivery-validation.json", "project-validation-report.json", "project-validation-report.md"];
    await Promise.all([
      writeFile(path.join(directory, files[0]), prd, "utf8"), writeJson(path.join(directory, files[1]), traceability), writeFile(path.join(directory, files[2]), renderTraceability(traceability), "utf8"),
      writeFile(path.join(directory, files[3]), review, "utf8"), writeJson(path.join(directory, files[4]), report), writeJson(path.join(directory, files[5]), validation), writeFile(path.join(directory, files[6]), validationMd, "utf8"),
    ]);
    return { report, directory, files: files.map((file) => path.join(directory, file)) };
  }
}
