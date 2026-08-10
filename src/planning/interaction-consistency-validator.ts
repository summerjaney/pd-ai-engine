import type {
  InteractionConsistencyIssue,
  InteractionConsistencyReport,
  PrototypeDsl,
  RequirementInteractionMap,
  RequirementPagePlan,
} from "../domain/types.js";

const GLOBAL_SOURCE = "global-navigation";

export function validateInteractionConsistency(
  prototype: PrototypeDsl,
  pagePlan: RequirementPagePlan,
  interactionMap: RequirementInteractionMap,
): InteractionConsistencyReport {
  const issues: InteractionConsistencyIssue[] = [];
  const pages = new Map(prototype.pages.map((page) => [page.id, page]));
  const triggerTargets = new Map<string, string[]>();

  for (const interaction of interactionMap.interactions) {
    const key = `${interaction.sourcePageId}:${interaction.triggerType}:${interaction.triggerId}`;
    const targets = triggerTargets.get(key) ?? [];
    targets.push(interaction.targetPageId);
    triggerTargets.set(key, targets);

    if (interaction.triggerType === "action" && interaction.sourcePageId !== GLOBAL_SOURCE) {
      const actionExists = pages.get(interaction.sourcePageId)?.actions.some((action) => action.id === interaction.triggerId) ?? false;
      if (!actionExists) issues.push({
        code: "MISSING_ACTION_TRIGGER", severity: "error", pageId: interaction.sourcePageId, triggerId: interaction.triggerId,
        message: `交互 ${key} 引用的页面操作不存在`,
      });
    }
    if (interaction.triggerType === "navigation") {
      const navigationExists = prototype.navigation.some((item) => item.pageId === interaction.triggerId && item.pageId === interaction.targetPageId);
      if (!navigationExists) issues.push({
        code: "MISSING_NAVIGATION_TRIGGER", severity: "error", pageId: interaction.targetPageId, triggerId: interaction.triggerId,
        message: `导航交互 ${key} 没有对应的导航定义`,
      });
    }
  }

  for (const [key, targets] of triggerTargets) {
    const uniqueTargets = [...new Set(targets)];
    const [pageId, , triggerId] = key.split(":");
    if (targets.length > 1) issues.push({
      code: "DUPLICATE_TRIGGER", severity: uniqueTargets.length > 1 ? "error" : "warning", pageId, triggerId,
      message: `触发器 ${key} 被定义 ${targets.length} 次`,
    });
    if (uniqueTargets.length > 1) issues.push({
      code: "CONFLICTING_TRIGGER_TARGET", severity: "error", pageId, triggerId,
      message: `触发器 ${key} 指向多个目标页面：${uniqueTargets.join("、")}`,
    });
  }

  for (const plannedPage of pagePlan.pages) {
    const actualUpstream = [...new Set(interactionMap.interactions
      .filter((item) => item.targetPageId === plannedPage.id && item.sourcePageId !== GLOBAL_SOURCE)
      .map((item) => item.sourcePageId))].sort();
    const actualDownstream = [...new Set(interactionMap.interactions
      .filter((item) => item.sourcePageId === plannedPage.id)
      .map((item) => item.targetPageId))].sort();
    if (JSON.stringify([...plannedPage.upstreamPageIds].sort()) !== JSON.stringify(actualUpstream)
      || JSON.stringify([...plannedPage.downstreamPageIds].sort()) !== JSON.stringify(actualDownstream)) {
      issues.push({
        code: "PLAN_RELATION_MISMATCH", severity: "error", pageId: plannedPage.id,
        message: `页面 ${plannedPage.id} 的上下游规划与交互图不一致`,
      });
    }
  }

  issues.sort((a, b) => a.code.localeCompare(b.code) || (a.pageId ?? "").localeCompare(b.pageId ?? "") || (a.triggerId ?? "").localeCompare(b.triggerId ?? ""));
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  return {
    schemaVersion: "0.7",
    valid: errorCount === 0,
    summary: {
      checkedInteractionCount: interactionMap.interactions.length,
      checkedPageCount: pagePlan.pages.length,
      errorCount,
      warningCount: issues.length - errorCount,
    },
    issues,
  };
}

export function renderInteractionConsistencyReport(report: InteractionConsistencyReport): string {
  const lines = [
    "# 页面交互一致性检查", "",
    `- 结论：${report.valid ? "通过" : "不通过"}`,
    `- 页面：${report.summary.checkedPageCount}`,
    `- 交互：${report.summary.checkedInteractionCount}`,
    `- 错误：${report.summary.errorCount}`,
    `- 警告：${report.summary.warningCount}`, "", "## 检查结果", "",
  ];
  if (report.issues.length === 0) lines.push("未发现页面交互一致性问题。");
  else for (const issue of report.issues) lines.push(`- [${issue.severity.toUpperCase()}] ${issue.code}：${issue.message}`);
  return `${lines.join("\n")}\n`;
}
