import type {
  PrototypeDsl,
  RequirementInteractionMap,
  RequirementPagePlan,
  PagePlanValidationIssue,
  PagePlanValidationReport,
} from "../domain/types.js";

const GLOBAL_SOURCE = "global-navigation";

export function validateRequirementPagePlan(
  pagePlan: RequirementPagePlan,
  interactionMap: RequirementInteractionMap,
  navigation: PrototypeDsl["navigation"] = [],
): PagePlanValidationReport {
  const issues: PagePlanValidationIssue[] = [];
  const counts = new Map<string, number>();
  for (const page of pagePlan.pages) counts.set(page.id, (counts.get(page.id) ?? 0) + 1);
  const pageIds = new Set(counts.keys());

  for (const [pageId, count] of counts) {
    if (count > 1) issues.push({ code: "DUPLICATE_PAGE_ID", severity: "error", pageId, message: `页面 ID ${pageId} 重复 ${count} 次` });
  }

  for (const interaction of interactionMap.interactions) {
    const transitionId = `${interaction.sourcePageId}:${interaction.triggerId}:${interaction.targetPageId}`;
    if (interaction.sourcePageId !== GLOBAL_SOURCE && !pageIds.has(interaction.sourcePageId)) {
      issues.push({ code: "INVALID_SOURCE_PAGE", severity: "error", pageId: interaction.sourcePageId, transitionId, message: `交互来源页面 ${interaction.sourcePageId} 不存在` });
    }
    if (!pageIds.has(interaction.targetPageId)) {
      issues.push({ code: "INVALID_TARGET_PAGE", severity: "error", pageId: interaction.targetPageId, transitionId, message: `交互目标页面 ${interaction.targetPageId} 不存在` });
    }
  }

  const navigationEntries = navigation.map((item) => item.pageId).filter((id) => pageIds.has(id));
  const globalEntries = interactionMap.interactions
    .filter((item) => item.sourcePageId === GLOBAL_SOURCE && pageIds.has(item.targetPageId))
    .map((item) => item.targetPageId);
  const entryPageIds = [...new Set([...navigationEntries, ...globalEntries])];
  if (pagePlan.pages.length > 0 && entryPageIds.length === 0) {
    issues.push({ code: "MISSING_FLOW_ENTRY", severity: "error", message: "页面集合没有有效的业务流入口" });
  }

  const validEdges = interactionMap.interactions.filter((item) => pageIds.has(item.sourcePageId) && pageIds.has(item.targetPageId));
  const incoming = new Set(validEdges.map((item) => item.targetPageId));
  const outgoing = new Set(validEdges.map((item) => item.sourcePageId));
  for (const page of pagePlan.pages) {
    if (!entryPageIds.includes(page.id) && !incoming.has(page.id) && !outgoing.has(page.id)) {
      issues.push({ code: "ISOLATED_PAGE", severity: "error", pageId: page.id, message: `页面 ${page.id} 未连接到任何业务流` });
    }
  }

  const reachable = new Set(entryPageIds);
  const queue = [...entryPageIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of validEdges.filter((item) => item.sourcePageId === current)) {
      if (!reachable.has(edge.targetPageId)) {
        reachable.add(edge.targetPageId);
        queue.push(edge.targetPageId);
      }
    }
  }
  for (const page of pagePlan.pages) {
    if (entryPageIds.length > 0 && !reachable.has(page.id)) {
      issues.push({ code: "UNREACHABLE_PAGE", severity: "error", pageId: page.id, message: `页面 ${page.id} 无法从业务流入口到达` });
    }
  }

  const exitPageIds = pagePlan.pages.map((page) => page.id).filter((id) => !outgoing.has(id));
  if (pagePlan.pages.length > 0 && exitPageIds.length === 0) {
    issues.push({ code: "MISSING_FLOW_EXIT", severity: "warning", message: "业务流没有明确的终点页面" });
  }

  issues.sort((a, b) => a.code.localeCompare(b.code) || (a.pageId ?? "").localeCompare(b.pageId ?? ""));
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return {
    schemaVersion: "0.7",
    valid: errorCount === 0,
    summary: { pageCount: pagePlan.pages.length, interactionCount: interactionMap.interactions.length, errorCount, warningCount },
    entryPageIds,
    exitPageIds,
    issues,
  };
}

export function renderPagePlanValidationReport(report: PagePlanValidationReport): string {
  const lines = [
    "# 页面规划完整性检查",
    "",
    `- 结论：${report.valid ? "通过" : "不通过"}`,
    `- 页面：${report.summary.pageCount}`,
    `- 交互：${report.summary.interactionCount}`,
    `- 错误：${report.summary.errorCount}`,
    `- 警告：${report.summary.warningCount}`,
    `- 入口页面：${report.entryPageIds.join("、") || "无"}`,
    `- 终点页面：${report.exitPageIds.join("、") || "无"}`,
    "",
    "## 检查结果",
    "",
  ];
  if (report.issues.length === 0) lines.push("未发现页面规划完整性问题。");
  else for (const issue of report.issues) lines.push(`- [${issue.severity.toUpperCase()}] ${issue.code}：${issue.message}`);
  return `${lines.join("\n")}\n`;
}
