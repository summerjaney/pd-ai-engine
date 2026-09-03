import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrototypeAction, PrototypeDsl, PrototypeField, PrototypePage, PrototypeTransition } from "../domain/types.js";
import { OutputValidator } from "../validation/output-validator.js";
import { buildRequirementPlanningArtifacts } from "../planning/requirement-page-plan.js";
import { validateRequirementPagePlan, renderPagePlanValidationReport } from "../planning/page-plan-validator.js";
import { validateDesignConsistency, renderDesignConsistencyReport } from "../planning/design-consistency-validator.js";
import { validateInteractionConsistency, renderInteractionConsistencyReport } from "../planning/interaction-consistency-validator.js";
import { buildMasterGoData, buildPrototypeManifest, renderInteractivePrototypeHtml, renderPreviewSvg } from "../prototype/bundle.js";

const writeJson = async (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const field = (id: string, label: string, type: PrototypeField["type"] = "text", required = false): PrototypeField => ({ id, label, type, required });
const action = (id: string, label: string, kind: PrototypeAction["kind"] = "secondary", confirmation = false): PrototypeAction => ({ id, label, kind, ...(confirmation ? { confirmation: true, confirmationMessage: `确认执行“${label}”吗？` } : {}) });
const page = (id: string, name: string, pattern: PrototypePage["pattern"], fields: PrototypeField[], actions: PrototypeAction[]): PrototypePage => ({
  id, name, route: `/ai-builder/${id}`, pattern, fields, actions,
  ...(pattern === "list" ? { tableColumns: fields.map((item) => item.id), pagination: { enabled: true, pageSize: 20 }, emptyState: { description: `暂无${name}数据`, actionId: actions[0]?.id } } : {}),
});
const transition = (sourcePageId: string, triggerId: string, triggerLabel: string, targetPageId: string): PrototypeTransition => ({ sourcePageId, triggerType: "action", triggerId, triggerLabel, targetPageId });

function prototype(): PrototypeDsl {
  const pages: PrototypePage[] = [
    page("task-list", "AI 搭建任务", "list", [field("task-id", "任务编号"), field("task-name", "应用名称"), field("task-status", "状态", "select"), field("task-updated", "更新时间", "datetime")], [action("create-task", "新建 AI 搭建", "primary"), action("view-task", "查看任务")]),
    page("requirement-input", "描述应用需求", "form", [field("business-goal", "业务目标", "textarea", true), field("requirement-text", "需求描述", "textarea", true), field("target-environment", "目标环境", "select", true), field("reference-material", "参考资料")], [action("analyze-requirement", "开始理解", "primary"), action("save-draft", "保存草稿")]),
    page("requirement-clarification", "需求理解与澄清", "form", [field("recognized-object", "业务对象", "textarea", true), field("recognized-role", "参与角色", "textarea", true), field("recognized-rule", "业务规则", "textarea", true), field("open-question", "待确认问题", "textarea")], [action("confirm-requirement", "确认需求", "primary"), action("reanalyze", "重新分析")]),
    page("plan-overview", "搭建方案总览", "detail", [field("plan-application", "应用结构"), field("plan-entity", "数据模型"), field("plan-form", "表单"), field("plan-workflow", "流程"), field("plan-permission", "权限"), field("plan-risk", "风险与待确认项", "textarea")], [action("confirm-plan", "确认方案", "primary"), action("revise-plan", "返回修改")]),
    page("entity-design", "数据模型确认", "form", [field("entity-name", "实体名称", "text", true), field("entity-fields", "字段清单", "textarea", true), field("entity-relations", "实体关系", "textarea"), field("entity-validation", "数据校验规则", "textarea")], [action("confirm-entity", "确认数据模型", "primary"), action("regenerate-entity", "重新生成")]),
    page("form-design", "表单方案确认", "form", [field("form-name", "表单名称", "text", true), field("form-layout", "表单布局", "textarea", true), field("form-fields", "字段与控件", "textarea", true), field("form-rules", "校验与联动", "textarea")], [action("confirm-form", "确认表单", "primary"), action("regenerate-form", "重新生成")]),
    page("workflow-design", "流程方案确认", "form", [field("workflow-name", "流程名称", "text", true), field("workflow-nodes", "审批节点", "textarea", true), field("workflow-conditions", "条件分支", "textarea", true), field("workflow-exceptions", "异常路径", "textarea")], [action("confirm-workflow", "确认流程", "primary"), action("regenerate-workflow", "重新生成")]),
    page("permission-design", "权限方案确认", "form", [field("permission-roles", "角色", "textarea", true), field("permission-objects", "授权对象", "textarea", true), field("permission-operations", "操作权限", "textarea", true), field("permission-data", "数据权限", "textarea")], [action("generate-config", "确认并生成配置", "primary", true), action("regenerate-permission", "重新生成")]),
    page("generation-progress", "配置生成进度", "detail", [field("progress-application", "应用与菜单"), field("progress-entity", "实体与字段"), field("progress-form", "表单"), field("progress-workflow", "流程"), field("progress-permission", "权限"), field("progress-message", "执行信息", "textarea")], [action("view-validation", "查看校验结果", "primary"), action("cancel-generation", "取消任务", "danger", true)]),
    page("validation-results", "配置校验结果", "list", [field("issue-level", "级别", "select"), field("issue-module", "模块", "select"), field("issue-object", "对象"), field("issue-message", "问题说明"), field("issue-remediation", "修复建议")], [action("preview-app", "进入应用预览", "primary"), action("regenerate-invalid", "局部重新生成")]),
    page("app-preview", "生成结果预览", "detail", [field("preview-application", "应用结构"), field("preview-form", "采购申请表"), field("preview-workflow", "条件审批流程"), field("preview-permission", "角色权限"), field("preview-diff", "目标环境差异", "textarea")], [action("prepare-publish", "准备发布", "primary"), action("back-validation", "返回校验结果")]),
    page("publish-confirm", "发布确认", "detail", [field("publish-environment", "目标环境"), field("publish-version", "发布版本"), field("publish-diff", "变更摘要", "textarea"), field("publish-risk", "风险提示", "textarea"), field("rollback-version", "回滚版本")], [action("confirm-publish", "确认发布", "primary", true), action("cancel-publish", "取消发布")]),
    page("publish-result", "发布结果", "detail", [field("result-status", "发布状态", "select"), field("result-version", "版本号"), field("result-audit", "审计记录"), field("result-rollback", "回滚点")], [action("return-task-list", "返回任务列表", "primary"), action("view-versions", "查看版本记录")]),
    page("version-history", "版本与回滚记录", "list", [field("version-number", "版本号"), field("version-status", "状态", "select"), field("version-operator", "操作人"), field("version-time", "发布时间", "datetime"), field("version-summary", "变更摘要")], [action("rollback-version", "回滚至此版本", "danger", true), action("back-task-list", "返回任务列表")]),
  ];
  const transitions: PrototypeTransition[] = [
    transition("task-list", "create-task", "新建 AI 搭建", "requirement-input"), transition("task-list", "view-task", "查看任务", "plan-overview"),
    transition("requirement-input", "analyze-requirement", "开始理解", "requirement-clarification"), transition("requirement-input", "save-draft", "保存草稿", "task-list"),
    transition("requirement-clarification", "confirm-requirement", "确认需求", "plan-overview"), transition("requirement-clarification", "reanalyze", "重新分析", "requirement-input"),
    transition("plan-overview", "confirm-plan", "确认方案", "entity-design"), transition("plan-overview", "revise-plan", "返回修改", "requirement-clarification"),
    transition("entity-design", "confirm-entity", "确认数据模型", "form-design"), transition("entity-design", "regenerate-entity", "重新生成", "entity-design"),
    transition("form-design", "confirm-form", "确认表单", "workflow-design"), transition("form-design", "regenerate-form", "重新生成", "form-design"),
    transition("workflow-design", "confirm-workflow", "确认流程", "permission-design"), transition("workflow-design", "regenerate-workflow", "重新生成", "workflow-design"),
    transition("permission-design", "generate-config", "确认并生成配置", "generation-progress"), transition("permission-design", "regenerate-permission", "重新生成", "permission-design"),
    transition("generation-progress", "view-validation", "查看校验结果", "validation-results"), transition("generation-progress", "cancel-generation", "取消任务", "task-list"),
    transition("validation-results", "preview-app", "进入应用预览", "app-preview"), transition("validation-results", "regenerate-invalid", "局部重新生成", "generation-progress"),
    transition("app-preview", "prepare-publish", "准备发布", "publish-confirm"), transition("app-preview", "back-validation", "返回校验结果", "validation-results"),
    transition("publish-confirm", "confirm-publish", "确认发布", "publish-result"), transition("publish-confirm", "cancel-publish", "取消发布", "app-preview"),
    transition("publish-result", "return-task-list", "返回任务列表", "task-list"), transition("publish-result", "view-versions", "查看版本记录", "version-history"),
    transition("version-history", "rollback-version", "回滚至此版本", "publish-confirm"), transition("version-history", "back-task-list", "返回任务列表", "task-list"),
  ];
  return {
    schemaVersion: "0.2",
    product: { name: "AI 应用搭建助手", description: "通过自然语言生成可审查、可校验、可回滚的低代码应用配置。", sourceAttribution: "PAE v2.1.0 已确认 AI 应用搭建助手需求设计包。" },
    navigation: [{ label: "AI 搭建任务", pageId: "task-list", roles: ["开发与实施人员", "平台运维与业务配置人员"] }, { label: "版本与回滚", pageId: "version-history", roles: ["应用发布负责人"] }],
    pages,
    rules: [
      { id: "RULE-AI-01", description: "需求规格和搭建方案必须由用户确认后才能生成配置。", appliesTo: ["requirement-clarification", "plan-overview"] },
      { id: "RULE-AI-02", description: "应用、实体、表单、流程和权限必须通过确定性校验。", appliesTo: ["generation-progress", "validation-results"] },
      { id: "RULE-AI-03", description: "局部重新生成只能修改受影响模块，并保留已通过模块。", appliesTo: ["validation-results"] },
      { id: "RULE-AI-04", description: "发布必须由有权限的负责人确认并建立回滚点。", appliesTo: ["publish-confirm", "version-history"] },
    ],
    transitions,
    errorFeedback: { validationMessage: "存在未通过的配置，请按模块修复后重新校验。", operationFailureMessage: "操作未完成，已保留当前任务和已通过模块。", recoveryAction: "查看失败模块并选择局部重新生成或重试。" },
    designTokens: { colors: { primary: "#2563EB", success: "#16A34A", warning: "#D97706", danger: "#DC2626", background: "#F5F7FA", surface: "#FFFFFF", text: "#172033" }, spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 4, md: 8, lg: 12 }, typography: { fontSize: { sm: 12, md: 14, lg: 16, xl: 24 }, fontWeight: { regular: 400, medium: 500, bold: 600 }, lineHeight: { sm: 18, md: 22, lg: 28 } } },
  };
}

function informationArchitecture(): string {
  return `# AI 应用搭建助手信息架构\n\n| 一级区域 | 页面 | 主要角色 |\n|---|---|---|\n| 任务管理 | AI 搭建任务、描述应用需求、需求理解与澄清 | 开发与实施、运维与业务配置 |\n| 方案确认 | 搭建方案总览、数据模型、表单、流程、权限确认 | 开发与实施、运维与业务配置 |\n| 生成验证 | 配置生成进度、配置校验结果、生成结果预览 | 开发与实施 |\n| 发布治理 | 发布确认、发布结果、版本与回滚记录 | 应用发布负责人 |\n\n## 设计原则\n\n- 将 AI 对话与结构化方案并列展示，避免只有聊天记录而没有正式配置。\n- 五类配置分别确认，支持局部重新生成。\n- 校验、预览、差异和回滚必须位于发布之前。\n- 普通搭建用户与发布负责人权限分离。\n`;
}

export class AiPrototypeDesignService {
  async generate(requirementDirectory: string): Promise<{ prototype: PrototypeDsl; pageCount: number; status: "PASS"; prototypeDirectory: string }> {
    const validationPath = path.join(requirementDirectory, "05-ai-config-contract", "validation-report.json");
    try { const report = JSON.parse(await readFile(validationPath, "utf8")) as { status?: string }; if (report.status !== "PASS") throw new Error("低代码 DSL 契约尚未通过，不能生成正式原型。"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("缺少低代码 DSL 契约校验结果，不能生成正式原型。"); throw error; }
    const value = prototype();
    const prototypeValidation = new OutputValidator().validatePrototype(value);
    if (!prototypeValidation.valid) throw new Error(`Prototype DSL 校验失败：${prototypeValidation.issues.map((item) => item.message).join("；")}`);
    const planning = buildRequirementPlanningArtifacts(value);
    const pageReport = validateRequirementPagePlan(planning.pagePlan, planning.interactionMap, value.navigation);
    const designReport = validateDesignConsistency(value, planning.designContext);
    const interactionReport = validateInteractionConsistency(value, planning.pagePlan, planning.interactionMap);
    if (!pageReport.valid || !designReport.valid || !interactionReport.valid) throw new Error("AI 原型的页面、设计或交互一致性检查未通过。");

    const pageDirectory = path.join(requirementDirectory, "04-page-structure"); const prototypeDirectory = path.join(requirementDirectory, "06-prototype"); const previewDirectory = path.join(prototypeDirectory, "preview");
    await Promise.all([mkdir(pageDirectory, { recursive: true }), mkdir(previewDirectory, { recursive: true })]);
    const manifest = buildPrototypeManifest(value); const masterGo = buildMasterGoData(value);
    await Promise.all([
      writeFile(path.join(pageDirectory, "information-architecture.md"), informationArchitecture(), "utf8"),
      writeJson(path.join(pageDirectory, "requirement-page-plan.json"), planning.pagePlan),
      writeJson(path.join(pageDirectory, "requirement-design-context.json"), planning.designContext),
      writeJson(path.join(pageDirectory, "requirement-interaction-map.json"), planning.interactionMap),
      writeJson(path.join(pageDirectory, "page-plan-validation.json"), pageReport),
      writeFile(path.join(pageDirectory, "page-plan-validation.md"), renderPagePlanValidationReport(pageReport), "utf8"),
      writeJson(path.join(pageDirectory, "design-consistency.json"), designReport),
      writeFile(path.join(pageDirectory, "design-consistency.md"), renderDesignConsistencyReport(designReport), "utf8"),
      writeJson(path.join(pageDirectory, "interaction-consistency.json"), interactionReport),
      writeFile(path.join(pageDirectory, "interaction-consistency.md"), renderInteractionConsistencyReport(interactionReport), "utf8"),
      writeJson(path.join(prototypeDirectory, "prototype.json"), value),
      writeJson(path.join(prototypeDirectory, "prototype-manifest.json"), manifest),
      writeJson(path.join(prototypeDirectory, "mastergo-data.json"), masterGo),
      writeFile(path.join(prototypeDirectory, "prototype.html"), renderInteractivePrototypeHtml(value, manifest), "utf8"),
      ...value.pages.map((item) => writeFile(path.join(previewDirectory, `${item.id}.svg`), renderPreviewSvg(item, value.product.name), "utf8")),
    ]);
    return { prototype: value, pageCount: value.pages.length, status: "PASS", prototypeDirectory };
  }
}
