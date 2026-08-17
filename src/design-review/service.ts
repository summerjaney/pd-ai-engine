import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChangeImpactReport } from "../change-impact/types.js";
import type { DeliveryConsistencyReport, DesignConsistencyReport, InteractionConsistencyReport, PagePlanValidationReport, PrdTraceabilityReport } from "../domain/types.js";
import { buildRealRequirementLoopReport } from "../real-requirement-loop/service.js";
import { readRequirementSourceIndex } from "../requirement-sources/service.js";
import type { DesignReviewIssue, DesignReviewLevel, DesignReviewReport } from "./types.js";
import type { PlatformKnowledgeConsistencyReport } from "../platform-knowledge/consistency.js";

async function optionalJson<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function normalizedLevel(severity: string): DesignReviewLevel {
  if (["error", "ERROR"].includes(severity)) return "BLOCKER";
  if (severity === "CONFIRMATION_REQUIRED") return "IMPORTANT";
  if (["warning", "WARNING"].includes(severity)) return "NORMAL";
  return "SUGGESTION";
}

export async function runDesignReview(requirementDirectory: string): Promise<{ report: DesignReviewReport; jsonPath: string; markdownPath: string }> {
  const root = path.resolve(requirementDirectory);
  const issues: DesignReviewIssue[] = [];
  const checks: DesignReviewReport["checks"] = [];
  const add = (issue: DesignReviewIssue) => issues.push(issue);

  const sources = await readRequirementSourceIndex(root);
  if (sources.sources.length === 0) add({ code: "NO_REQUIREMENT_SOURCES", level: "IMPORTANT", source: "source-index", message: "尚未登记任何需求来源。", artifact: "00-sources/source-index.json" });
  for (const source of sources.sources.filter((item) => item.sensitivity === "confidential" && item.includeInAnalysis)) {
    add({ code: "CONFIDENTIAL_SOURCE_INCLUDED", level: "BLOCKER", source: "source-index", message: `机密来源 ${source.id} 被标记为纳入 AI 分析。`, artifact: source.storedPath });
  }
  checks.push({ id: "requirement-sources", status: issues.some((item) => item.source === "source-index" && item.level === "BLOCKER") ? "FAIL" : sources.sources.length ? "PASS" : "PENDING", issueCount: issues.filter((item) => item.source === "source-index").length });

  const loop = await buildRealRequirementLoopReport(root);
  for (const gate of loop.gates.filter((item) => item.status !== "CONFIRMED")) {
    add({ code: `GATE_${gate.status}`, level: gate.status === "INVALIDATED" ? "BLOCKER" : "IMPORTANT", source: "design-loop", message: `${gate.name}：${gate.blockers.join("；")}`, artifact: gate.artifacts[0] });
  }
  checks.push({ id: "human-confirmations", status: loop.status === "READY_FOR_DEVELOPMENT_REVIEW" ? "PASS" : loop.gates.some((gate) => gate.status === "INVALIDATED") ? "FAIL" : "PENDING", issueCount: loop.gates.filter((gate) => gate.status !== "CONFIRMED").length });

  const validationReports = [
    { id: "page-plan", file: "05-page-plan/validation-report.json", value: await optionalJson<PagePlanValidationReport>(path.join(root, "05-page-plan/validation-report.json")) },
    { id: "design-consistency", file: "05-page-plan/design-consistency-report.json", value: await optionalJson<DesignConsistencyReport>(path.join(root, "05-page-plan/design-consistency-report.json")) },
    { id: "interaction-consistency", file: "05-page-plan/interaction-consistency-report.json", value: await optionalJson<InteractionConsistencyReport>(path.join(root, "05-page-plan/interaction-consistency-report.json")) },
    { id: "prd-traceability", file: "09-validation/prd-traceability.json", value: await optionalJson<PrdTraceabilityReport>(path.join(root, "09-validation/prd-traceability.json")) },
    { id: "delivery-consistency", file: "09-validation/delivery-consistency-report.json", value: await optionalJson<DeliveryConsistencyReport>(path.join(root, "09-validation/delivery-consistency-report.json")) },
  ];
  for (const item of validationReports) {
    if (!item.value) {
      add({ code: "VALIDATION_REPORT_MISSING", level: "IMPORTANT", source: item.id, message: `缺少 ${item.id} 检查报告。`, artifact: item.file });
      checks.push({ id: item.id, status: "NOT_AVAILABLE", issueCount: 1 });
      continue;
    }
    const rawIssues = "issues" in item.value && Array.isArray(item.value.issues) ? item.value.issues as Array<{ code: string; severity: string; message: string }> : [];
    for (const issue of rawIssues) add({ code: issue.code, level: normalizedLevel(issue.severity), source: item.id, message: issue.message, artifact: item.file });
    const valid = "valid" in item.value ? Boolean(item.value.valid) : rawIssues.every((issue) => normalizedLevel(issue.severity) !== "BLOCKER");
    checks.push({ id: item.id, status: valid ? "PASS" : "FAIL", issueCount: rawIssues.length });
  }

  const platformKnowledge = await optionalJson<PlatformKnowledgeConsistencyReport>(path.join(root, "09-validation/platform-knowledge-consistency.json"));
  if (platformKnowledge) {
    for (const issue of platformKnowledge.issues) add({ code: issue.code, level: normalizedLevel(issue.severity), source: "platform-knowledge-consistency", message: issue.message, artifact: issue.artifact });
    checks.push({ id: "platform-knowledge-consistency", status: platformKnowledge.valid ? "PASS" : "FAIL", issueCount: platformKnowledge.issues.length });
  } else {
    checks.push({ id: "platform-knowledge-consistency", status: "NOT_AVAILABLE", issueCount: 0 });
  }

  const impact = await optionalJson<ChangeImpactReport>(path.join(root, "11-change-impact/change-impact-report.json"));
  if (impact) {
    for (const conflict of impact.conflicts) add({ code: conflict.code, level: normalizedLevel(conflict.severity), source: "change-impact", message: conflict.message, artifact: "11-change-impact/change-impact-report.json" });
    checks.push({ id: "change-impact", status: impact.canProceed ? "PASS" : "FAIL", issueCount: impact.conflicts.length });
  } else {
    add({ code: "CHANGE_IMPACT_NOT_AVAILABLE", level: "SUGGESTION", source: "change-impact", message: "尚无产品基线或变更影响报告。", artifact: "11-change-impact/change-impact-report.json" });
    checks.push({ id: "change-impact", status: "NOT_AVAILABLE", issueCount: 1 });
  }

  const levels: DesignReviewLevel[] = ["BLOCKER", "IMPORTANT", "NORMAL", "SUGGESTION"];
  const summary = Object.assign({ total: issues.length }, Object.fromEntries(levels.map((level) => [level, issues.filter((item) => item.level === level).length]))) as DesignReviewReport["summary"];
  const status = summary.BLOCKER > 0 ? "FAIL" : summary.IMPORTANT > 0 ? "PENDING" : "PASS";
  const report: DesignReviewReport = { schemaVersion: "1.3", generatedAt: new Date().toISOString(), status, summary, checks, issues };
  const directory = path.join(root, "10-review");
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "v1.3-design-review.json");
  const markdownPath = path.join(directory, "v1.3-design-review.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderDesignReview(report), "utf8")]);
  return { report, jsonPath, markdownPath };
}

export function renderDesignReview(report: DesignReviewReport): string {
  const rows = report.checks.map((check) => `| ${check.id} | ${check.status} | ${check.issueCount} |`).join("\n");
  const issues = report.issues.length ? report.issues.map((issue) => `- [${issue.level}] ${issue.code}（${issue.source}）：${issue.message}`).join("\n") : "无。";
  return `# v1.3.0 跨成果物设计检查\n\n- 结论：${report.status}\n- 阻断：${report.summary.BLOCKER}\n- 重要：${report.summary.IMPORTANT}\n- 一般：${report.summary.NORMAL}\n- 建议：${report.summary.SUGGESTION}\n\n## 检查项\n\n| 检查 | 状态 | 问题数 |\n|---|---|---|\n${rows}\n\n## 问题清单\n\n${issues}\n`;
}
