import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ReleaseObjectiveService } from "../release-objective/service.js";
import type { ReleaseObjective } from "../release-objective/types.js";
import type { ReleaseRetrospective, ReleaseRetrospectiveInput } from "./types.js";

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const directory = (projectDirectory: string, version: string): string => path.join(projectDirectory, "releases", `v${version.replace(/^v/, "")}`);
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());

function assertInput(value: unknown): asserts value is ReleaseRetrospectiveInput {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !Array.isArray((value as Record<string, unknown>).results)) throw new Error("发布后结果必须包含 results 数组。");
  for (const item of (value as ReleaseRetrospectiveInput).results) for (const field of ["id", "value", "source", "observationWindow"] as const) if (!text(item[field])) throw new Error(`发布后指标结果缺少有效字段：${field}`);
}

function numeric(value: string): number | undefined { const matched = value.match(/-?\d+(?:\.\d+)?/); return matched ? Number(matched[0]) : undefined; }
function assessment(actual: string, target: string): "met" | "not-met" | "needs-review" { const a = numeric(actual); const t = numeric(target); if (a === undefined || t === undefined) return "needs-review"; return a >= t ? "met" : "not-met"; }
function suggestion(status: "met" | "not-met" | "needs-review"): string { return status === "met" ? "结果达到目标，可由产品经理评估是否扩大适用范围。" : status === "not-met" ? "结果未达到目标，建议复核价值假设、使用路径和数据质量后再决定后续投入。" : "指标口径或数值无法自动比较，需产品经理人工判断是否达标。"; }

export class ReleaseRetrospectiveService {
  async record(projectDirectory: string, version: string, inputPath: string): Promise<{ report: ReleaseRetrospective; jsonPath: string; markdownPath: string }> {
    const objectiveCheck = await new ReleaseObjectiveService().check(projectDirectory, version);
    if (!objectiveCheck.check.valid || !objectiveCheck.objective) throw new Error(`发布后复盘被阻断：${objectiveCheck.check.issues.join("；")}`);
    const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown; assertInput(input); const objective = objectiveCheck.objective;
    const results = (input as ReleaseRetrospectiveInput).results; const known = new Map(objective.metrics.map((metric) => [metric.id, metric]));
    if (results.length !== known.size || results.some((item) => !known.has(item.id)) || new Set(results.map((item) => item.id)).size !== results.length) throw new Error("发布后结果必须为版本目标中的每个成功指标各提供一次结果。");
    const report: ReleaseRetrospective = { schemaVersion: "1.9", productVersion: version.replace(/^v/, ""), objectiveHash: hash(objective), recordedAt: new Date().toISOString(), recordedBy: "product-manager", note: (input as ReleaseRetrospectiveInput).note?.trim() || undefined,
      results: results.map((item) => { const metric = known.get(item.id)!; const result = assessment(item.value, metric.target); return { ...item, metricName: metric.name, target: metric.target, assessment: result, suggestion: suggestion(result) }; }) };
    const target = directory(projectDirectory, version); await mkdir(target, { recursive: true }); const jsonPath = path.join(target, "release-retrospective.json"); const markdownPath = path.join(target, "release-retrospective.md");
    const rows = report.results.map((item) => `| ${item.id} | ${item.metricName} | ${item.target} | ${item.value} | ${item.assessment} | ${item.suggestion} |`).join("\n");
    await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, `# ${report.productVersion} 发布后复盘\n\n| 指标 | 名称 | 目标 | 实际 | 判断 | 后续建议 |\n|---|---|---|---|---|---|\n${rows}\n\n> 本报告仅提供规划参考，不自动修改需求优先级、需求状态、版本基线或正式知识。\n`, "utf8")]);
    return { report, jsonPath, markdownPath };
  }
}
