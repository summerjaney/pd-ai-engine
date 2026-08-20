import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReleaseScopeDecision } from "../release-planning/types.js";
import type { ReleaseObjective, ReleaseObjectiveCheck, ReleaseObjectiveInput } from "./types.js";

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const directory = (projectDirectory: string, version: string): string => path.join(projectDirectory, "releases", `v${version.replace(/^v/, "")}`);
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());

function assertInput(value: unknown): asserts value is ReleaseObjectiveInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("版本目标必须是 JSON 对象。");
  const input = value as Record<string, unknown>;
  if (!text(input.objective) || !text(input.owner)) throw new Error("版本目标必须提供 objective 和 owner。");
  for (const field of ["targetUsers", "opportunityIds", "metrics"] as const) if (!Array.isArray(input[field]) || !input[field].length) throw new Error(`版本目标必须提供非空 ${field}。`);
  if ((input.targetUsers as unknown[]).some((item) => !text(item)) || (input.opportunityIds as unknown[]).some((item) => !text(item))) throw new Error("版本目标用户和机会 ID 必须是非空字符串。");
  for (const metric of input.metrics as unknown[]) {
    if (typeof metric !== "object" || metric === null || Array.isArray(metric)) throw new Error("版本成功指标必须是对象。");
    for (const field of ["id", "name", "definition", "baseline", "target", "observationWindow", "dataSource"]) if (!text((metric as Record<string, unknown>)[field])) throw new Error(`版本成功指标缺少有效字段：${field}`);
  }
}

async function scope(projectDirectory: string, version: string): Promise<ReleaseScopeDecision> {
  try { return JSON.parse(await readFile(path.join(directory(projectDirectory, version), "release-scope-decision.json"), "utf8")) as ReleaseScopeDecision; }
  catch { throw new Error("尚未选择版本范围，不能确认版本目标。"); }
}

export class ReleaseObjectiveService {
  async set(projectDirectory: string, version: string, inputPath: string): Promise<{ objective: ReleaseObjective; jsonPath: string; markdownPath: string }> {
    const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown; assertInput(input);
    const decision = await scope(projectDirectory, version); const productVersion = version.replace(/^v/, "");
    const objective: ReleaseObjective = { ...input, schemaVersion: "1.9", productVersion, scopeDecisionHash: hash(decision), confirmedAt: new Date().toISOString(), confirmedBy: "product-manager" };
    const target = directory(projectDirectory, productVersion); await mkdir(target, { recursive: true }); const jsonPath = path.join(target, "release-objective.json"); const markdownPath = path.join(target, "release-metrics.md");
    const rows = objective.metrics.map((item) => `| ${item.id} | ${item.name} | ${item.baseline} | ${item.target} | ${item.observationWindow} | ${item.dataSource} |`).join("\n");
    await Promise.all([writeFile(jsonPath, `${JSON.stringify(objective, null, 2)}\n`, "utf8"), writeFile(markdownPath, `# ${productVersion} 版本目标与成功指标\n\n- 目标：${objective.objective}\n- 目标用户：${objective.targetUsers.join("、")}\n- 关联机会：${objective.opportunityIds.join("、")}\n- 负责人：${objective.owner}\n\n| 指标ID | 指标 | 基线 | 目标阈值 | 观察窗口 | 数据来源 |\n|---|---|---|---|---|---|\n${rows}\n`, "utf8")]);
    return { objective, jsonPath, markdownPath };
  }

  async check(projectDirectory: string, version: string): Promise<{ objective?: ReleaseObjective; check: ReleaseObjectiveCheck; jsonPath: string; markdownPath: string }> {
    const target = directory(projectDirectory, version); const jsonPath = path.join(target, "release-objective-check.json"); const markdownPath = path.join(target, "release-objective-check.md"); let objective: ReleaseObjective | undefined; const issues: string[] = []; let stale = false;
    try { objective = JSON.parse(await readFile(path.join(target, "release-objective.json"), "utf8")) as ReleaseObjective; assertInput(objective); if (objective.schemaVersion !== "1.9") issues.push("版本目标 Schema 版本无效。"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") issues.push("尚未确认版本目标和成功指标。"); else throw error; }
    if (objective) { const decision = await scope(projectDirectory, version); if (objective.productVersion !== version.replace(/^v/, "")) issues.push("版本目标与目标版本不一致。"); if (objective.scopeDecisionHash !== hash(decision)) { stale = true; issues.push("版本范围已变化，版本目标确认失效。"); } }
    const check = { valid: issues.length === 0, stale, issues };
    await mkdir(target, { recursive: true }); await Promise.all([writeFile(jsonPath, `${JSON.stringify(check, null, 2)}\n`, "utf8"), writeFile(markdownPath, `# 版本目标校验\n\n- 结论：${check.valid ? "PASS" : "FAIL"}\n- 已失效：${stale ? "是" : "否"}\n\n${issues.length ? issues.map((item) => `- ${item}`).join("\n") : "- 版本目标、成功指标和版本范围均有效。"}\n`, "utf8")]);
    return { objective, check, jsonPath, markdownPath };
  }
}
