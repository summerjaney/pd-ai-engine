import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MarketEvidenceService } from "../market-evidence/service.js";
import type { MarketEvidence } from "../market-evidence/types.js";
import type { DiscoveryItem, DiscoveryKind, DiscoveryReport, DiscoveryReviewStatus, Opportunity, ProblemStatement, ValueHypothesis } from "./types.js";

const REPORT = "discovery-report.json";
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const itemReview = () => ({ status: "pending" as const, note: "" });

function evidenceHash(evidence: MarketEvidence[]): string {
  return hash(JSON.stringify(evidence.map((item) => ({ id: item.id, contentFingerprint: item.contentFingerprint }))));
}

function audience(evidence: MarketEvidence): string {
  switch (evidence.type) {
    case "competitor": return "产品经理与平台管理员";
    case "customer-feedback": return "受访客户与一线使用者";
    case "business-metric": return "业务运营负责人";
    case "internal-insight": return "交付、实施与支持团队";
  }
}

function scenario(evidence: MarketEvidence): string {
  switch (evidence.type) {
    case "competitor": return "评估平台能力差异并确定产品演进方向时";
    case "customer-feedback": return "执行当前业务操作和配置时";
    case "business-metric": return "观察业务流程完成率和转化表现时";
    case "internal-insight": return "交付、实施或支持问题复盘时";
  }
}

function deriveOne(evidence: MarketEvidence): { problem: ProblemStatement; opportunity: Opportunity; hypothesis: ValueHypothesis } {
  const problemId = `problem.${evidence.id}`;
  const opportunityId = `opportunity.${evidence.id}`;
  return {
    problem: { id: problemId, targetUser: audience(evidence), scenario: scenario(evidence), obstacle: evidence.summary, impact: "该问题可能降低使用效率、业务完成质量或平台竞争力，需由产品经理确认实际影响。", evidenceIds: [evidence.id], confidence: evidence.type === "business-metric" ? "high" : "medium" },
    opportunity: { id: opportunityId, name: `${evidence.name}对应的改进机会`, problemIds: [problemId], affectedScope: "当前关联业务场景及其目标用户", evidenceIds: [evidence.id], confidence: evidence.type === "business-metric" ? "high" : "medium" },
    hypothesis: { id: `value-hypothesis.${evidence.id}`, opportunityId, statement: `若围绕“${evidence.name}”所反映的问题交付经确认的产品能力，可降低目标用户在该场景中的操作阻碍。`, expectedOutcome: "由产品经理在后续版本目标中补充具体指标、基线与目标阈值。", evidenceIds: [evidence.id], confidence: "medium" },
  };
}

function render(report: DiscoveryReport): string {
  const problems = report.problems.map(({ value, review }) => `| ${value.id} | ${value.targetUser} | ${value.obstacle} | ${value.evidenceIds.join("、")} | ${review.status} |`).join("\n");
  const opportunities = report.opportunities.map(({ value, review }) => `| ${value.id} | ${value.name} | ${value.problemIds.join("、")} | ${value.evidenceIds.join("、")} | ${review.status} |`).join("\n");
  const hypotheses = report.valueHypotheses.map(({ value, review }) => `| ${value.id} | ${value.opportunityId} | ${value.expectedOutcome} | ${value.evidenceIds.join("、")} | ${review.status} |`).join("\n");
  return `# 市场发现草稿\n\n- 状态：${report.status}\n- 市场证据指纹：${report.evidenceCatalogHash}\n\n## 问题陈述\n\n| ID | 目标用户 | 障碍 | 证据 | 审核 |\n|---|---|---|---|---|\n${problems}\n\n## 机会点\n\n| ID | 名称 | 问题 | 证据 | 审核 |\n|---|---|---|---|---|\n${opportunities}\n\n## 价值假设\n\n| ID | 机会 | 预期结果 | 证据 | 审核 |\n|---|---|---|---|---|\n${hypotheses}\n\n> 本报告为草稿。只有产品经理明确确认的问题、机会和价值假设才能进入正式需求和版本规划。市场证据变化后，原审核自动失效。\n`;
}

function allItems(report: DiscoveryReport): Array<DiscoveryItem<ProblemStatement | Opportunity | ValueHypothesis>> {
  return [...report.problems, ...report.opportunities, ...report.valueHypotheses];
}

export class DiscoveryService {
  async derive(evidenceDirectory: string, discoveryDirectory: string): Promise<{ report: DiscoveryReport; jsonPath: string; markdownPath: string }> {
    const evidence = (await new MarketEvidenceService().load(evidenceDirectory)).evidence;
    if (!evidence.length) throw new Error("市场证据目录为空，不能生成问题、机会和价值假设草稿。");
    const catalogHash = evidenceHash(evidence);
    let existing: DiscoveryReport | undefined;
    try { existing = await this.load(discoveryDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const previous = existing?.evidenceCatalogHash === catalogHash ? new Map(allItems(existing).map((item) => [item.value.id, item.review])) : new Map();
    const derived = evidence.map(deriveOne);
    const withReview = <T extends { id: string }>(value: T): DiscoveryItem<T> => ({ value, review: previous.get(value.id) ?? itemReview() });
    const problems = derived.map((item) => withReview(item.problem)); const opportunities = derived.map((item) => withReview(item.opportunity)); const valueHypotheses = derived.map((item) => withReview(item.hypothesis));
    const status = [...problems, ...opportunities, ...valueHypotheses].every((item) => item.review.status !== "pending") ? "reviewed" : "pending-product-manager-review";
    const report: DiscoveryReport = { schemaVersion: "1.9", generatedAt: new Date().toISOString(), evidenceCatalogHash: catalogHash, status, problems, opportunities, valueHypotheses };
    await mkdir(discoveryDirectory, { recursive: true });
    const jsonPath = path.join(discoveryDirectory, REPORT); const markdownPath = path.join(discoveryDirectory, "discovery-report.md");
    await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, render(report), "utf8")]);
    return { report, jsonPath, markdownPath };
  }

  async load(directory: string): Promise<DiscoveryReport> {
    const report = JSON.parse(await readFile(path.join(directory, REPORT), "utf8")) as DiscoveryReport;
    if (report.schemaVersion !== "1.9" || !report.evidenceCatalogHash || !Array.isArray(report.problems) || !Array.isArray(report.opportunities) || !Array.isArray(report.valueHypotheses)) throw new Error("市场发现报告结构无效。");
    for (const item of allItems(report)) if (!item.value?.id || !item.review || !["pending", "confirmed", "rejected"].includes(item.review.status)) throw new Error("市场发现报告含有无效审核记录。");
    return report;
  }

  async status(evidenceDirectory: string, discoveryDirectory: string): Promise<{ report: DiscoveryReport; stale: boolean }> {
    const report = await this.load(discoveryDirectory);
    const evidence = (await new MarketEvidenceService().load(evidenceDirectory)).evidence;
    return { report, stale: report.evidenceCatalogHash !== evidenceHash(evidence) };
  }

  async review(evidenceDirectory: string, discoveryDirectory: string, kind: DiscoveryKind, id: string, decision: Exclude<DiscoveryReviewStatus, "pending">, note = ""): Promise<{ report: DiscoveryReport; jsonPath: string }> {
    const current = await this.status(evidenceDirectory, discoveryDirectory);
    if (current.stale) throw new Error("市场证据已变化，发现草稿审核已失效；请重新执行 discovery derive。");
    const collection = kind === "problem" ? current.report.problems : kind === "opportunity" ? current.report.opportunities : current.report.valueHypotheses;
    const item = collection.find((candidate) => candidate.value.id === id);
    if (!item) throw new Error(`未找到${kind}草稿：${id}`);
    item.review = { status: decision, note: note.trim(), reviewedAt: new Date().toISOString() };
    current.report.status = allItems(current.report).every((candidate) => candidate.review.status !== "pending") ? "reviewed" : "pending-product-manager-review";
    const jsonPath = path.join(discoveryDirectory, REPORT); const markdownPath = path.join(discoveryDirectory, "discovery-report.md");
    await Promise.all([writeFile(jsonPath, `${JSON.stringify(current.report, null, 2)}\n`, "utf8"), writeFile(markdownPath, render(current.report), "utf8")]);
    return { report: current.report, jsonPath };
  }
}
