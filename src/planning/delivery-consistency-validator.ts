import type { DeliveryConsistencyIssue, DeliveryConsistencyReport, MasterGoData, MasterGoResult, PrdTraceabilityReport, PrototypeDsl, WorkflowArtifacts } from "../domain/types.js";

export function validateDeliveryConsistency(
  prototype: PrototypeDsl,
  mastergo: { data: MasterGoData; result?: MasterGoResult },
  confirmation: WorkflowArtifacts["prototype-confirmation"],
  traceability: PrdTraceabilityReport,
): DeliveryConsistencyReport {
  const issues: DeliveryConsistencyIssue[] = [];
  const pageIds = new Set(prototype.pages.map((page) => page.id));
  const screenIds = new Set(mastergo.data.screens.map((screen) => screen.id));
  const createdIds = new Set(mastergo.result?.createdPages.map((page) => page.pageId) ?? []);

  for (const page of prototype.pages) {
    const screen = mastergo.data.screens.find((item) => item.id === page.id);
    if (!screen) {
      issues.push({ code: "PROTOTYPE_PAGE_MISSING_IN_MASTERGO", severity: "error", pageId: page.id, message: `Prototype 页面 ${page.name}（${page.id}）未生成 MasterGo 屏幕。` });
      continue;
    }
    const expectedNodes = [...page.fields.map((field) => field.id), ...page.actions.map((action) => action.id)].sort();
    const actualNodes = screen.nodes.filter((node) => node.type === "field" || node.type === "action").map((node) => node.id).sort();
    if (JSON.stringify(expectedNodes) !== JSON.stringify(actualNodes)) {
      issues.push({ code: "MASTERGO_NODE_MISMATCH", severity: "error", pageId: page.id, message: `页面 ${page.id} 的字段或操作节点与 Prototype DSL 不一致。` });
    }
    if (mastergo.result && !createdIds.has(page.id)) {
      issues.push({ code: "MASTERGO_PAGE_NOT_CREATED", severity: "error", pageId: page.id, message: `页面 ${page.id} 未出现在 MasterGo 写入结果中。` });
    }
  }

  for (const screen of mastergo.data.screens) {
    if (!pageIds.has(screen.id)) issues.push({ code: "MASTERGO_SCREEN_WITHOUT_PROTOTYPE", severity: "error", pageId: screen.id, message: `MasterGo 屏幕 ${screen.id} 没有对应的 Prototype 页面。` });
  }
  if (!mastergo.result || mastergo.result.status === "pending") {
    issues.push({ code: "MASTERGO_PENDING_VERIFICATION", severity: "warning", message: "MasterGo 页面已生成，但仍待真实画布验收。" });
  } else if (mastergo.result.status === "rejected") {
    issues.push({ code: "MASTERGO_PAGE_NOT_CREATED", severity: "error", message: "MasterGo 写入结果已被拒绝。" });
  }
  if (confirmation?.status !== "confirmed") issues.push({ code: "PROTOTYPE_NOT_CONFIRMED", severity: "error", message: "原型尚未确认，不能视为完整交付。" });
  for (const item of traceability.items.filter((item) => !item.prdCovered)) {
    issues.push({ code: "PRD_TRACEABILITY_GAP", severity: "error", pageId: item.pageId, sourceId: item.id, message: `PRD 未覆盖 ${item.kind}：${item.label}（${item.id}）。` });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const prototypeToMasterGo = issues.some((issue) => ["PROTOTYPE_PAGE_MISSING_IN_MASTERGO", "MASTERGO_SCREEN_WITHOUT_PROTOTYPE", "MASTERGO_NODE_MISMATCH"].includes(issue.code)) ? "FAIL" : "PASS";
  const submission = !mastergo.result || mastergo.result.status === "pending" ? "PENDING" : mastergo.result.status === "confirmed" && !issues.some((issue) => issue.code === "MASTERGO_PAGE_NOT_CREATED") ? "PASS" : "FAIL";
  return {
    schemaVersion: "0.7", requirementId: traceability.requirementId, valid: errorCount === 0,
    summary: { prototypePageCount: prototype.pages.length, mastergoScreenCount: screenIds.size, createdPageCount: createdIds.size, prdTraceabilityCount: traceability.items.length, errorCount, warningCount },
    checks: { prototypeToMasterGo, masterGoSubmission: submission, prototypeConfirmation: confirmation?.status === "confirmed" ? "PASS" : "FAIL", prdTraceability: traceability.valid ? "PASS" : "FAIL" },
    issues,
  };
}

export function renderDeliveryConsistencyReport(report: DeliveryConsistencyReport): string {
  const issues = report.issues.length === 0 ? "无。" : report.issues.map((issue) => `- [${issue.severity.toUpperCase()}] ${issue.code}${issue.pageId ? ` (${issue.pageId})` : ""}：${issue.message}`).join("\n");
  return `# 完整交付一致性报告\n\n- 需求编号：${report.requirementId ?? "未指定"}\n- 结论：${report.valid ? "PASS" : "FAIL"}\n- Prototype → MasterGo：${report.checks.prototypeToMasterGo}\n- MasterGo 写入：${report.checks.masterGoSubmission}\n- 原型确认：${report.checks.prototypeConfirmation}\n- PRD 追踪：${report.checks.prdTraceability}\n- 错误/警告：${report.summary.errorCount}/${report.summary.warningCount}\n\n## 问题\n\n${issues}\n`;
}
