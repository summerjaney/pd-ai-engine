import type { PrototypeDsl } from "../domain/types.js";
import type { ManualConsistencyIssue, ManualConsistencyReport, ManualTraceabilityMatrix, OperationManual, ProductManual } from "./types.js";

const key = (pageId: string, sourceId: string): string => `${pageId}:${sourceId}`;

function expectedPageRoles(prototype: PrototypeDsl, pageId: string, allRoles: string[]): string[] {
  const navigationRoles = prototype.navigation.filter((item) => item.pageId === pageId).flatMap((item) => item.roles ?? []);
  if (navigationRoles.length > 0) return [...new Set(navigationRoles)].sort();
  const actionRoles = prototype.pages.find((page) => page.id === pageId)?.actions.flatMap((action) => action.roles ?? []) ?? [];
  return (actionRoles.length > 0 ? [...new Set(actionRoles)] : allRoles).sort();
}

export function validateManualConsistency(
  prototype: PrototypeDsl,
  productManual: ProductManual,
  operationManual: OperationManual,
  traceability: ManualTraceabilityMatrix,
): ManualConsistencyReport {
  const issues: ManualConsistencyIssue[] = [];
  const add = (code: ManualConsistencyIssue["code"], message: string, sourceId?: string): void => {
    issues.push({ code, severity: "error", message, sourceId });
  };
  const moduleByPage = new Map(productManual.modules.map((module) => [module.id.replace(/^module:/, ""), module]));
  const prototypePageIds = new Set(prototype.pages.map((page) => page.id));
  for (const page of prototype.pages) if (!moduleByPage.has(page.id)) add("MISSING_PAGE", `产品手册缺少页面：${page.name}（${page.id}）。`, page.id);
  for (const pageId of moduleByPage.keys()) if (!prototypePageIds.has(pageId)) add("UNKNOWN_PAGE", `产品手册引用了不存在的页面：${pageId}。`, pageId);

  const prototypeFields = new Set(prototype.pages.flatMap((page) => page.fields.map((field) => key(page.id, field.id))));
  const manualFields = new Set(productManual.modules.flatMap((module) => module.fields.map((field) => key(module.id.replace(/^module:/, ""), field.id))));
  for (const sourceId of prototypeFields) if (!manualFields.has(sourceId)) add("MISSING_FIELD", `产品手册缺少字段：${sourceId}。`, sourceId);
  for (const sourceId of manualFields) if (!prototypeFields.has(sourceId)) add("UNKNOWN_FIELD", `产品手册引用了不存在的字段：${sourceId}。`, sourceId);

  const prototypeActions = new Set(prototype.pages.flatMap((page) => page.actions.map((action) => key(page.id, action.id))));
  const manualActions = new Set(productManual.modules.flatMap((module) => module.actions.map((action) => key(module.id.replace(/^module:/, ""), action.id))));
  for (const sourceId of prototypeActions) if (!manualActions.has(sourceId)) add("MISSING_ACTION", `产品手册缺少操作：${sourceId}。`, sourceId);
  for (const sourceId of manualActions) if (!prototypeActions.has(sourceId)) add("UNKNOWN_ACTION", `产品手册引用了不存在的操作：${sourceId}。`, sourceId);

  const allRoles = productManual.roles.map((role) => role.name).sort();
  for (const page of prototype.pages) {
    const expected = expectedPageRoles(prototype, page.id, allRoles);
    const actual = productManual.roles.filter((role) => role.pageIds.includes(page.id)).map((role) => role.name).sort();
    if (expected.join("\0") !== actual.join("\0")) add("ROLE_ACCESS_MISMATCH", `页面 ${page.id} 的角色范围不一致；期望 ${expected.join("、")}，实际 ${actual.join("、")}。`, page.id);
  }

  const transitionKeys = new Set(prototype.transitions.map((item) => `${item.sourcePageId}:${item.triggerId}:${item.targetPageId}`));
  const operations = operationManual.roleGuides.flatMap((guide) => guide.operations.map((operation) => ({ role: guide.role, operation })));
  for (const { role, operation } of operations) {
    for (const step of operation.steps) {
      const page = prototype.pages.find((item) => item.id === step.pageId);
      const action = page?.actions.find((item) => item.id === step.actionId);
      if (!page || !action) {
        add("INVALID_OPERATION_STEP", `操作 ${operation.id} 引用了不存在的页面或按钮：${step.pageId}:${step.actionId}。`, operation.id);
        continue;
      }
      const allowedRoles = action.roles?.length ? action.roles : allRoles;
      if (!allowedRoles.includes(role)) add("ROLE_ACCESS_MISMATCH", `角色 ${role} 无权执行 ${step.pageId}:${step.actionId}。`, operation.id);
      if (step.targetPageId && !transitionKeys.has(`${step.pageId}:${step.actionId}:${step.targetPageId}`)) {
        add("INVALID_TRANSITION", `操作 ${operation.id} 引用了不存在的跳转：${step.pageId}:${step.actionId}:${step.targetPageId}。`, operation.id);
      }
    }
  }

  const prototypeRules = new Set(prototype.rules.map((rule) => rule.id));
  const manualRules = new Set(productManual.rules.map((rule) => rule.id));
  for (const sourceId of prototypeRules) if (!manualRules.has(sourceId)) add("MISSING_RULE", `产品手册缺少业务规则：${sourceId}。`, sourceId);
  for (const sourceId of manualRules) if (!prototypeRules.has(sourceId)) add("UNKNOWN_RULE", `产品手册引用了不存在的业务规则：${sourceId}。`, sourceId);

  for (const item of traceability.items) {
    if (item.productManualSectionIds.length === 0 && item.operationIds.length === 0 && item.sourceKind !== "requirement" && item.sourceKind !== "prd") {
      add("TRACEABILITY_GAP", `来源未追踪到任何手册内容：${item.sourceKind}:${item.sourceId}。`, item.sourceId);
    }
  }
  if (traceability.summary.missingCount > 0) add("TRACEABILITY_GAP", `追踪矩阵仍有 ${traceability.summary.missingCount} 项未覆盖。`);

  const failed = (codes: ManualConsistencyIssue["code"][]): "PASS" | "FAIL" => issues.some((issue) => codes.includes(issue.code)) ? "FAIL" : "PASS";
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  return {
    schemaVersion: "0.8",
    requirementId: productManual.requirementId,
    valid: errorCount === 0,
    summary: {
      pageCount: prototype.pages.length,
      fieldCount: prototypeFields.size,
      actionCount: prototypeActions.size,
      ruleCount: prototypeRules.size,
      operationCount: operations.length,
      errorCount,
      warningCount: issues.length - errorCount,
    },
    checks: {
      pageCoverage: failed(["MISSING_PAGE", "UNKNOWN_PAGE"]),
      fieldAndActionConsistency: failed(["MISSING_FIELD", "UNKNOWN_FIELD", "MISSING_ACTION", "UNKNOWN_ACTION"]),
      roleAccessConsistency: failed(["ROLE_ACCESS_MISMATCH"]),
      operationPathConsistency: failed(["INVALID_OPERATION_STEP", "INVALID_TRANSITION"]),
      ruleConsistency: failed(["MISSING_RULE", "UNKNOWN_RULE"]),
      traceability: failed(["TRACEABILITY_GAP"]),
    },
    issues,
  };
}

export function renderManualConsistencyReport(report: ManualConsistencyReport): string {
  const issues = report.issues.length ? report.issues.map((issue) => `- [${issue.severity.toUpperCase()}] ${issue.code}：${issue.message}`).join("\n") : "无。";
  return `# PAE v0.8.0 手册一致性检查报告\n\n- 检查结论：${report.valid ? "PASS" : "FAIL"}\n- 页面覆盖：${report.checks.pageCoverage}\n- 字段与操作：${report.checks.fieldAndActionConsistency}\n- 角色权限：${report.checks.roleAccessConsistency}\n- 操作路径：${report.checks.operationPathConsistency}\n- 业务规则：${report.checks.ruleConsistency}\n- 追踪关系：${report.checks.traceability}\n- 错误：${report.summary.errorCount}\n- 警告：${report.summary.warningCount}\n\n## 检查问题\n\n${issues}\n`;
}
