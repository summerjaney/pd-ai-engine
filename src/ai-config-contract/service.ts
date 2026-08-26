import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AiConfigValidationIssue, AiConfigValidationReport, AiPublishPlan, AiRegenerationPlan, LowCodeDslBundle, LowCodeFieldType, LowCodeModuleId } from "./types.js";

const MODULES: LowCodeModuleId[] = ["application", "entity", "form", "workflow", "permission"];
const FIELD_TYPES: LowCodeFieldType[] = ["text", "number", "textarea", "user", "department", "datetime"];
const DOWNSTREAM: Record<LowCodeModuleId, LowCodeModuleId[]> = {
  application: ["application", "permission"],
  entity: ["entity", "form", "workflow", "permission"],
  form: ["form"],
  workflow: ["workflow"],
  permission: ["permission"],
};
const unique = <T>(values: T[]): T[] => [...new Set(values)];
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const writeJson = async (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");

function validate(bundle: LowCodeDslBundle): AiConfigValidationReport {
  const issues: AiConfigValidationIssue[] = [];
  const add = (issue: AiConfigValidationIssue): void => { issues.push(issue); };
  if (bundle.schemaVersion !== "2.1") add({ code: "SCHEMA_VERSION_INVALID", severity: "BLOCKER", module: "application", message: "DSL schemaVersion 必须为 2.1。", remediation: "使用 v2.1 低代码 DSL Schema 重新生成整包。" });
  if (!bundle.planConfirmed) add({ code: "PLAN_NOT_CONFIRMED", severity: "BLOCKER", module: "application", message: "搭建方案未经用户确认。", remediation: "返回方案确认步骤，确认后再生成 DSL。" });
  if (!bundle.targetApplication || !text(bundle.targetApplication.id) || !text(bundle.targetApplication.name)) add({ code: "APPLICATION_INVALID", severity: "ERROR", module: "application", message: "应用缺少有效 ID 或名称。", remediation: "重新生成应用模块。" });
  if (!Array.isArray(bundle.entities) || !bundle.entities.length) add({ code: "ENTITY_MISSING", severity: "ERROR", module: "entity", message: "至少需要一个实体。", remediation: "根据结构化需求重新生成实体。" });
  if (!Array.isArray(bundle.forms) || !bundle.forms.length) add({ code: "FORM_MISSING", severity: "ERROR", module: "form", message: "至少需要一个表单。", remediation: "根据实体重新生成表单。" });
  if (!Array.isArray(bundle.workflows) || !bundle.workflows.length) add({ code: "WORKFLOW_MISSING", severity: "ERROR", module: "workflow", message: "至少需要一个流程。", remediation: "根据审批规则重新生成流程。" });
  if (!Array.isArray(bundle.permissions) || !bundle.permissions.length) add({ code: "PERMISSION_MISSING", severity: "ERROR", module: "permission", message: "至少需要一个角色权限。", remediation: "根据参与角色重新生成权限。" });

  const entityIds = new Set<string>(); const entityFieldIds = new Map<string, Set<string>>();
  for (const entity of bundle.entities ?? []) {
    if (!text(entity.id) || entityIds.has(entity.id)) add({ code: "ENTITY_ID_INVALID", severity: "ERROR", module: "entity", objectId: entity.id, message: "实体 ID 为空或重复。", remediation: "为实体生成稳定唯一 ID。" });
    entityIds.add(entity.id); const fields = new Set<string>();
    for (const field of entity.fields ?? []) {
      if (!text(field.id) || fields.has(field.id)) add({ code: "FIELD_ID_INVALID", severity: "ERROR", module: "entity", objectId: entity.id, message: "字段 ID 为空或重复。", remediation: "在当前实体内重新生成唯一字段 ID。" });
      fields.add(field.id);
      if (!FIELD_TYPES.includes(field.type)) add({ code: "FIELD_TYPE_INVALID", severity: "ERROR", module: "entity", objectId: field.id, message: `字段类型不受支持：${String(field.type)}`, remediation: "映射为平台支持的字段类型。" });
    }
    entityFieldIds.set(entity.id, fields);
  }

  for (const form of bundle.forms ?? []) {
    const fields = entityFieldIds.get(form.entityId);
    if (!fields) add({ code: "FORM_ENTITY_NOT_FOUND", severity: "ERROR", module: "form", objectId: form.id, message: `表单引用不存在的实体：${form.entityId}`, remediation: "修正实体引用后局部重新生成表单。" });
    else for (const fieldId of form.fieldIds ?? []) if (!fields.has(fieldId)) add({ code: "FORM_FIELD_NOT_FOUND", severity: "ERROR", module: "form", objectId: form.id, message: `表单引用不存在的字段：${fieldId}`, remediation: "依据实体字段重新生成表单字段引用。" });
  }

  for (const workflow of bundle.workflows ?? []) {
    if (!entityIds.has(workflow.entityId)) add({ code: "WORKFLOW_ENTITY_NOT_FOUND", severity: "ERROR", module: "workflow", objectId: workflow.id, message: `流程引用不存在的实体：${workflow.entityId}`, remediation: "修正实体引用后局部重新生成流程。" });
    const nodeIds = new Set(workflow.nodes?.map((item) => item.id) ?? []);
    if ((workflow.nodes ?? []).filter((item) => item.type === "start").length !== 1 || (workflow.nodes ?? []).filter((item) => item.type === "end").length < 1) add({ code: "WORKFLOW_BOUNDARY_INVALID", severity: "ERROR", module: "workflow", objectId: workflow.id, message: "流程必须有且仅有一个开始节点，并至少有一个结束节点。", remediation: "重新生成流程边界节点。" });
    for (const node of workflow.nodes ?? []) if (node.type === "approval" && !text(node.assignee)) add({ code: "APPROVER_MISSING", severity: "ERROR", module: "workflow", objectId: node.id, message: "审批节点缺少参与人。", remediation: "根据角色规则补充审批人。" });
    for (const transition of workflow.transitions ?? []) if (!nodeIds.has(transition.sourceId) || !nodeIds.has(transition.targetId)) add({ code: "TRANSITION_NODE_NOT_FOUND", severity: "ERROR", module: "workflow", objectId: transition.id, message: "流程连线引用不存在的节点。", remediation: "仅重新生成流程连线。" });
  }

  const objectIds = new Set<string>([bundle.targetApplication?.id, ...(bundle.entities ?? []).map((item) => item.id), ...(bundle.forms ?? []).map((item) => item.id), ...(bundle.workflows ?? []).map((item) => item.id)].filter(text));
  for (const permission of bundle.permissions ?? []) {
    if (!text(permission.roleId) || !permission.operations?.length) add({ code: "PERMISSION_INVALID", severity: "ERROR", module: "permission", objectId: permission.roleId, message: "权限缺少角色或操作。", remediation: "根据确认角色重新生成权限。" });
    for (const objectId of permission.objectIds ?? []) if (!objectIds.has(objectId)) add({ code: "PERMISSION_OBJECT_NOT_FOUND", severity: "ERROR", module: "permission", objectId: permission.roleId, message: `权限引用不存在的对象：${objectId}`, remediation: "使用有效应用、实体、表单或流程 ID 更新权限。" });
  }
  if (!bundle.publish?.requiresConfirmation) add({ code: "PUBLISH_CONFIRMATION_MISSING", severity: "BLOCKER", module: "application", message: "发布未启用显式确认。", remediation: "设置 requiresConfirmation=true。" });
  if (!text(bundle.publish?.rollbackFromVersion)) add({ code: "ROLLBACK_BASELINE_MISSING", severity: "BLOCKER", module: "application", message: "发布计划缺少回滚基线。", remediation: "选择目标环境当前版本作为回滚点。" });
  const checks = MODULES.map((module) => ({ id: `${module}-contract`, status: issues.some((item) => item.module === module) ? "FAIL" as const : "PASS" as const, message: issues.some((item) => item.module === module) ? `${issues.filter((item) => item.module === module).length} 个问题` : "结构与引用校验通过" }));
  return { schemaVersion: "2.1", status: issues.some((item) => item.severity === "BLOCKER" || item.severity === "ERROR") ? "FAIL" : "PASS", checks, issues, validatedModules: MODULES };
}

function regeneration(report: AiConfigValidationReport): AiRegenerationPlan {
  const direct = unique(report.issues.filter((item) => item.severity !== "WARNING").map((item) => item.module));
  const regenerateModules = MODULES.filter((module) => direct.flatMap((item) => DOWNSTREAM[item]).includes(module));
  return {
    schemaVersion: "2.1", status: "REGENERATION_REQUIRED", regenerateModules,
    preservedModules: MODULES.filter((module) => !regenerateModules.includes(module)),
    reasons: direct.map((module) => ({ module, issueCodes: unique(report.issues.filter((item) => item.module === module).map((item) => item.code)) })),
    requiresPlanReconfirmation: report.issues.some((item) => item.code === "PLAN_NOT_CONFIRMED" || item.code === "SCHEMA_VERSION_INVALID"),
  };
}

function publishPlan(bundle: LowCodeDslBundle): AiPublishPlan {
  return {
    schemaVersion: "2.1", status: "WAITING_PUBLISH_CONFIRMATION", targetEnvironment: bundle.publish.targetEnvironment, modules: MODULES,
    orderedOperations: ["建立发布前配置快照", "写入应用与菜单", "写入实体和字段", "写入表单", "写入流程", "写入角色权限", "执行发布后完整性校验"],
    preconditions: ["搭建方案已确认", "五类 DSL 全部校验通过", "发布人拥有目标环境发布权限", "发布前差异已展示并由发布人确认"],
    rollback: { snapshotRequired: true, fromVersion: bundle.publish.rollbackFromVersion, strategy: "任一模块写入失败即停止后续操作，并将已写入模块恢复至发布前快照。", auditRequired: true },
  };
}

function renderReport(report: AiConfigValidationReport): string {
  return `# AI 低代码配置契约校验\n\n- 结论：${report.status}\n- 校验模块：${report.validatedModules.join("、")}\n\n| 模块 | 状态 | 说明 |\n|---|---|---|\n${report.checks.map((item) => `| ${item.id} | ${item.status} | ${item.message} |`).join("\n")}\n\n## 问题\n\n${report.issues.map((item) => `- [${item.severity}] ${item.code}（${item.module}${item.objectId ? `/${item.objectId}` : ""}）：${item.message}；${item.remediation}`).join("\n") || "- 无"}\n`;
}

export class AiConfigContractService {
  async validate(requirementDirectory: string, inputPath: string): Promise<{ report: AiConfigValidationReport; regenerationPlan?: AiRegenerationPlan; publishPlan?: AiPublishPlan; directory: string }> {
    const manifestPath = path.join(requirementDirectory, "00-ai-design-brief", "design-manifest.json");
    try { const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { status?: string }; if (manifest.status !== "READY_FOR_DETAILED_DESIGN") throw new Error("AI 需求设计包尚未就绪。"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("缺少 AI 需求设计包，不能校验配置 DSL。"); throw error; }
    const bundle = JSON.parse(await readFile(inputPath, "utf8")) as LowCodeDslBundle;
    const report = validate(bundle); const directory = path.join(requirementDirectory, "05-ai-config-contract"); await mkdir(directory, { recursive: true });
    const regenerationPlan = report.status === "FAIL" ? regeneration(report) : undefined;
    const readyPublishPlan = report.status === "PASS" ? publishPlan(bundle) : undefined;
    await Promise.all([
      writeJson(path.join(directory, "lowcode-dsl.json"), bundle),
      writeJson(path.join(directory, "validation-report.json"), report),
      writeFile(path.join(directory, "validation-report.md"), renderReport(report), "utf8"),
      ...(regenerationPlan ? [writeJson(path.join(directory, "regeneration-plan.json"), regenerationPlan)] : []),
      ...(readyPublishPlan ? [writeJson(path.join(directory, "publish-plan.json"), readyPublishPlan)] : []),
    ]);
    return { report, regenerationPlan, publishPlan: readyPublishPlan, directory };
  }
}
