import type {
  DesignConsistencyIssue,
  DesignConsistencyReport,
  PrototypeDsl,
  RequirementDesignContext,
} from "../domain/types.js";

export function validateDesignConsistency(
  prototype: PrototypeDsl,
  context: RequirementDesignContext,
): DesignConsistencyReport {
  const issues: DesignConsistencyIssue[] = [];
  const fieldDefinitions = new Map<string, { label: string; type: string; pageId: string }>();

  for (const page of prototype.pages) {
    for (const field of page.fields) {
      const previous = fieldDefinitions.get(field.id);
      if (previous && (previous.label !== field.label || previous.type !== field.type)) {
        issues.push({
          code: "FIELD_DEFINITION_CONFLICT", severity: "error", pageId: page.id, fieldId: field.id,
          message: `字段 ${field.id} 在页面 ${previous.pageId} 与 ${page.id} 的名称或类型不一致`,
        });
      } else if (!previous) fieldDefinitions.set(field.id, { label: field.label, type: field.type, pageId: page.id });
    }

    const primaryActions = page.actions.filter((action) => action.kind === "primary");
    if (primaryActions.length > context.conventions.primaryActionLimit) {
      issues.push({
        code: "TOO_MANY_PRIMARY_ACTIONS", severity: "warning", pageId: page.id,
        message: `页面 ${page.id} 有 ${primaryActions.length} 个主操作，超过约定上限 ${context.conventions.primaryActionLimit}`,
      });
    }
    if (context.conventions.destructiveActionRequiresConfirmation) {
      for (const action of page.actions.filter((item) => item.kind === "danger" && (!item.confirmation || !item.confirmationMessage))) {
        issues.push({
          code: "DANGER_ACTION_WITHOUT_CONFIRMATION", severity: "error", pageId: page.id, actionId: action.id,
          message: `页面 ${page.id} 的危险操作 ${action.id} 缺少确认提示`,
        });
      }
    }
    if (page.pattern === "list" && !page.pagination?.enabled) {
      issues.push({ code: "LIST_WITHOUT_PAGINATION", severity: "warning", pageId: page.id, message: `列表页 ${page.id} 未启用分页` });
    }
    if (page.pattern === "list" && !page.emptyState) {
      issues.push({ code: "LIST_WITHOUT_EMPTY_STATE", severity: "warning", pageId: page.id, message: `列表页 ${page.id} 缺少空状态设计` });
    }
  }

  issues.sort((a, b) => a.code.localeCompare(b.code) || (a.pageId ?? "").localeCompare(b.pageId ?? ""));
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  return {
    schemaVersion: "0.7",
    valid: errorCount === 0,
    context,
    summary: {
      pageCount: prototype.pages.length,
      checkedFieldCount: prototype.pages.reduce((total, page) => total + page.fields.length, 0),
      checkedActionCount: prototype.pages.reduce((total, page) => total + page.actions.length, 0),
      errorCount,
      warningCount: issues.length - errorCount,
    },
    pages: prototype.pages.map((page) => ({ pageId: page.id, frame: context.frame, conventions: context.conventions })),
    issues,
  };
}

export function renderDesignConsistencyReport(report: DesignConsistencyReport): string {
  const lines = [
    "# 多页面设计一致性检查", "",
    `- 结论：${report.valid ? "通过" : "不通过"}`,
    `- 页面：${report.summary.pageCount}`,
    `- 字段：${report.summary.checkedFieldCount}`,
    `- 操作：${report.summary.checkedActionCount}`,
    `- 错误：${report.summary.errorCount}`,
    `- 警告：${report.summary.warningCount}`, "", "## 检查结果", "",
  ];
  if (report.issues.length === 0) lines.push("未发现多页面设计一致性问题。");
  else for (const issue of report.issues) lines.push(`- [${issue.severity.toUpperCase()}] ${issue.code}：${issue.message}`);
  return `${lines.join("\n")}\n`;
}
