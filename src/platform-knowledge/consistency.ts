import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrototypeDsl, StageId } from "../domain/types.js";
import type { PlatformKnowledgeUsagePlan } from "./trace.js";

export interface PlatformKnowledgeConsistencyIssue {
  code: "PLATFORM_KNOWLEDGE_REFERENCE_MISSING" | "PLATFORM_KNOWLEDGE_PLAN_MISSING";
  severity: "error" | "warning";
  stage?: StageId;
  knowledgeId?: string;
  artifact: string;
  message: string;
}

export interface PlatformKnowledgeConsistencyReport {
  schemaVersion: "1.4";
  valid: boolean;
  summary: { checkedStageCount: number; checkedReferenceCount: number; errorCount: number; warningCount: number };
  checks: Array<{ stage: StageId; artifact: string; expected: string[]; missing: string[]; status: "PASS" | "FAIL" }>;
  issues: PlatformKnowledgeConsistencyIssue[];
}

const ARTIFACTS: Partial<Record<StageId, string>> = {
  "requirement-analysis": "01-requirement-analysis.md",
  "product-outline": "02-product-outline.md",
  "product-architecture": "03-product-architecture.md",
  "core-flow": "04-core-flow.md",
  "page-structure": "05-page-structure.md",
  prototype: "06-prototype/prototype.json",
  prd: "09-prd.md",
  review: "10-review.md",
};

async function optionalText(file: string): Promise<string | undefined> {
  try { return await readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function validatePlatformKnowledgeConsistency(requirementDirectory: string, plan?: PlatformKnowledgeUsagePlan): Promise<PlatformKnowledgeConsistencyReport> {
  if (!plan) {
    const raw = await optionalText(path.join(requirementDirectory, "00-platform-analysis", "knowledge-usage-plan.json"));
    if (raw) plan = JSON.parse(raw) as PlatformKnowledgeUsagePlan;
  }
  const issues: PlatformKnowledgeConsistencyIssue[] = [];
  const checks: PlatformKnowledgeConsistencyReport["checks"] = [];
  if (!plan) {
    issues.push({ code: "PLATFORM_KNOWLEDGE_PLAN_MISSING", severity: "warning", artifact: "00-platform-analysis/knowledge-usage-plan.json", message: "未生成平台知识使用计划。" });
  } else {
    for (const [stage, items] of Object.entries(plan.stages) as Array<[StageId, NonNullable<PlatformKnowledgeUsagePlan["stages"][StageId]>]>) {
      if (!items?.length || !ARTIFACTS[stage]) continue;
      const artifact = ARTIFACTS[stage]!;
      const raw = await optionalText(path.join(requirementDirectory, artifact));
      if (!raw) continue;
      const searchable = stage === "prototype" ? JSON.stringify(JSON.parse(raw) as PrototypeDsl) : raw;
      const missing = items.filter((item) => !searchable.includes(`platform-knowledge:${item.id}@${item.version}`)).map((item) => item.id);
      checks.push({ stage, artifact, expected: items.map((item) => item.id), missing, status: missing.length ? "FAIL" : "PASS" });
      for (const id of missing) issues.push({ code: "PLATFORM_KNOWLEDGE_REFERENCE_MISSING", severity: "error", stage, knowledgeId: id, artifact, message: `${stage} 未引用计划中的平台知识 ${id}。` });
    }
  }
  return {
    schemaVersion: "1.4",
    valid: !issues.some((issue) => issue.severity === "error"),
    summary: { checkedStageCount: checks.length, checkedReferenceCount: checks.reduce((sum, item) => sum + item.expected.length, 0), errorCount: issues.filter((item) => item.severity === "error").length, warningCount: issues.filter((item) => item.severity === "warning").length },
    checks,
    issues,
  };
}

export function renderPlatformKnowledgeConsistency(report: PlatformKnowledgeConsistencyReport): string {
  const rows = report.checks.map((item) => `| ${item.stage} | ${item.status} | ${item.expected.length} | ${item.missing.join("、") || "—"} |`).join("\n") || "| 暂无 | PASS | 0 | — |";
  return `# 平台知识引用一致性检查\n\n- 结论：${report.valid ? "PASS" : "FAIL"}\n- 检查阶段：${report.summary.checkedStageCount}\n- 检查引用：${report.summary.checkedReferenceCount}\n- 错误：${report.summary.errorCount}\n\n| 阶段 | 状态 | 应引用 | 缺失 |\n|---|---|---:|---|\n${rows}\n`;
}

export async function writePlatformKnowledgeConsistency(requirementDirectory: string, plan?: PlatformKnowledgeUsagePlan): Promise<PlatformKnowledgeConsistencyReport> {
  const report = await validatePlatformKnowledgeConsistency(requirementDirectory, plan);
  const directory = path.join(requirementDirectory, "09-validation");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "platform-knowledge-consistency.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(directory, "platform-knowledge-consistency.md"), renderPlatformKnowledgeConsistency(report), "utf8"),
  ]);
  return report;
}
