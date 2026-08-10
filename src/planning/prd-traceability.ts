import type { PrdTraceabilityItem, PrdTraceabilityReport, PrototypeDsl, RequirementContext } from "../domain/types.js";

function stableId(prefix: string, ...parts: string[]): string {
  const value = parts.join("-").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${value || "UNSPECIFIED"}`.toUpperCase();
}

export function buildPrdTraceabilityReport(
  prototype: PrototypeDsl,
  prd: string,
  requirement?: RequirementContext,
): PrdTraceabilityReport {
  const items: PrdTraceabilityItem[] = [];

  for (const page of prototype.pages) {
    const pageSourceId = stableId("PAGE", page.id);
    items.push({ id: pageSourceId, kind: "page", label: page.name, pageId: page.id, sourceId: page.id, prdCovered: prd.includes(page.name) && prd.includes(page.route) });
    for (const field of page.fields) {
      items.push({
        id: stableId("FIELD", page.id, field.id), kind: "field", label: field.label,
        pageId: page.id, sourceId: field.id, prdCovered: prd.includes(page.name) && prd.includes(field.label),
      });
    }
    const acceptanceLabel = `${page.name}可按定义完成页面操作`;
    items.push({
      id: stableId("AC", page.id), kind: "acceptance-criterion", label: acceptanceLabel,
      pageId: page.id, sourceId: pageSourceId, prdCovered: prd.includes(page.name) && page.actions.every((action) => prd.includes(action.label)),
    });
  }

  for (const rule of prototype.rules) {
    items.push({ id: stableId("RULE", rule.id), kind: "rule", label: rule.description, sourceId: rule.id, prdCovered: prd.includes(rule.description) });
  }

  const count = (kind: PrdTraceabilityItem["kind"]) => items.filter((item) => item.kind === kind).length;
  const coveredCount = items.filter((item) => item.prdCovered).length;
  return {
    schemaVersion: "0.7", requirementId: requirement?.requirementId, valid: coveredCount === items.length,
    summary: {
      pageCount: count("page"), fieldCount: count("field"), ruleCount: count("rule"),
      acceptanceCriteriaCount: count("acceptance-criterion"), coveredCount, missingCount: items.length - coveredCount,
    },
    items,
  };
}

export function renderPrdTraceabilityReport(report: PrdTraceabilityReport): string {
  const rows = report.items.map((item) => `| ${item.id} | ${item.kind} | ${item.pageId ?? "-"} | ${item.label} | ${item.prdCovered ? "PASS" : "MISSING"} |`).join("\n");
  return `# PRD 追踪矩阵\n\n- 需求编号：${report.requirementId ?? "未指定"}\n- 结论：${report.valid ? "PASS" : "FAIL"}\n- 覆盖：${report.summary.coveredCount}/${report.items.length}\n\n| 稳定标识 | 类型 | 页面 | 名称 | PRD 覆盖 |\n|---|---|---|---|---|\n${rows}\n`;
}
