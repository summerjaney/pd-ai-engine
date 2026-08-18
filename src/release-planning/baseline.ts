import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzePortfolioRelationships, assessRequirementPortfolio, buildRequirementPortfolio } from "../release-portfolio/service.js";
import { readReleaseOptions } from "./service.js";
import type { ReleaseBaseline, ReleaseChangeReport, ReleaseScopeDecision } from "./types.js";

const hash = (value: unknown): string => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const normalizeVersion = (value: string): string => value.replace(/^v/, "");
const directory = (projectDirectory: string, version: string): string => path.join(projectDirectory, "releases", `v${normalizeVersion(version)}`);

async function readJson<T>(file: string, label: string): Promise<T> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) { throw new Error(`无法读取${label}：${(error as Error).message}`); }
}

async function currentState(projectDirectory: string): Promise<{ portfolio: Awaited<ReturnType<typeof buildRequirementPortfolio>>["portfolio"]; inputFingerprint: string; relationshipFingerprint: string }> {
  const [{ portfolio }, { assessment }, { analysis }] = await Promise.all([buildRequirementPortfolio(projectDirectory), assessRequirementPortfolio(projectDirectory), analyzePortfolioRelationships(projectDirectory)]);
  return { portfolio, inputFingerprint: hash({ portfolio: portfolio.requirements, assessment: assessment.requirements, relations: analysis.relationships }), relationshipFingerprint: hash(analysis.relationships) };
}

export async function establishReleaseBaseline(projectDirectory: string, versionValue: string): Promise<{ baseline: ReleaseBaseline; path: string }> {
  const productVersion = normalizeVersion(versionValue); const targetDirectory = directory(projectDirectory, productVersion);
  const decision = await readJson<ReleaseScopeDecision>(path.join(targetDirectory, "release-scope-decision.json"), "版本范围决策");
  const optionSet = await readReleaseOptions(projectDirectory, productVersion); const state = await currentState(projectDirectory);
  if (decision.optionSetFingerprint !== hash(optionSet)) throw new Error("版本基线建立被阻断：版本范围决策与候选方案不一致。");
  if (optionSet.inputFingerprint !== state.inputFingerprint) throw new Error("版本基线建立被阻断：需求组合、评分或关系已经变化，请重新规划并确认版本范围。");
  const selected = state.portfolio.requirements.filter((item) => decision.includedRequirementIds.includes(item.requirementId));
  const invalid = selected.filter((item) => item.admissionStatus === "BLOCKED" || item.admissionStatus === "STALE");
  if (invalid.length) throw new Error(`版本基线建立被阻断：${invalid.map((item) => `${item.requirementId}(${item.admissionStatus})`).join("、")}`);
  const baselinePath = path.join(targetDirectory, "release-baseline.json"); let previous: ReleaseBaseline | undefined;
  try { previous = await readJson<ReleaseBaseline>(baselinePath, "版本基线"); } catch {}
  const decisionFingerprint = hash(decision);
  if (previous?.decisionFingerprint === decisionFingerprint && previous.inputFingerprint === state.inputFingerprint) throw new Error("版本基线未变化，禁止重复建立相同基线。");
  const sequence = (previous?.sequence ?? 0) + 1;
  if (previous) { const history = path.join(targetDirectory, "history"); await mkdir(history, { recursive: true }); await writeFile(path.join(history, `release-baseline-${previous.sequence}.json`), `${JSON.stringify(previous, null, 2)}\n`, "utf8"); }
  const baseline: ReleaseBaseline = { schemaVersion: "1.7", productVersion, sequence, status: "confirmed", establishedAt: new Date().toISOString(), decisionFingerprint, inputFingerprint: state.inputFingerprint, includedRequirements: selected.map((item) => ({ requirementId: item.requirementId, revision: item.revision, admissionStatus: item.admissionStatus, moduleIds: item.moduleIds })).sort((a, b) => a.requirementId.localeCompare(b.requirementId)), deferredRequirementIds: decision.deferredRequirementIds, relationshipFingerprint: state.relationshipFingerprint };
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8"); return { baseline, path: baselinePath };
}

export async function detectReleaseChanges(projectDirectory: string, versionValue: string): Promise<{ report: ReleaseChangeReport; jsonPath: string; markdownPath: string }> {
  const productVersion = normalizeVersion(versionValue); const targetDirectory = directory(projectDirectory, productVersion);
  const baseline = await readJson<ReleaseBaseline>(path.join(targetDirectory, "release-baseline.json"), "版本基线"); const state = await currentState(projectDirectory);
  const baselineMap = new Map(baseline.includedRequirements.map((item) => [item.requirementId, item])); const currentMap = new Map(state.portfolio.requirements.map((item) => [item.requirementId, item]));
  const addedRequirements = [...currentMap.keys()].filter((id) => !baselineMap.has(id)).sort();
  const removedRequirements = [...baselineMap.keys()].filter((id) => !currentMap.has(id)).sort();
  const revisedRequirements = [...baselineMap].filter(([id, item]) => currentMap.get(id)?.revision !== item.revision).map(([id]) => id).sort();
  const admissionChanges = [...baselineMap].filter(([id, item]) => currentMap.get(id) && currentMap.get(id)!.admissionStatus !== item.admissionStatus).map(([id]) => id).sort();
  const invalidIncludedRequirements = [...baselineMap.keys()].filter((id) => { const status = currentMap.get(id)?.admissionStatus; return !status || status === "BLOCKED" || status === "STALE"; }).sort();
  const relationshipChanged = state.relationshipFingerprint !== baseline.relationshipFingerprint;
  const changed = Boolean(addedRequirements.length || removedRequirements.length || revisedRequirements.length || admissionChanges.length || invalidIncludedRequirements.length || relationshipChanged);
  const report: ReleaseChangeReport = { schemaVersion: "1.7", productVersion, baselineSequence: baseline.sequence, checkedAt: new Date().toISOString(), status: changed ? "CHANGE_DETECTED" : "CURRENT", changes: { addedRequirements, removedRequirements, revisedRequirements, admissionChanges, relationshipChanged, invalidIncludedRequirements }, invalidatedConfirmation: changed };
  const jsonPath = path.join(targetDirectory, "release-change-report.json"); const markdownPath = path.join(targetDirectory, "release-change-report.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderReleaseChangeReport(report), "utf8")]); return { report, jsonPath, markdownPath };
}

export async function readReleaseStatus(projectDirectory: string, versionValue: string): Promise<{ baseline: ReleaseBaseline; change?: ReleaseChangeReport }> {
  const target = directory(projectDirectory, versionValue); const baseline = await readJson<ReleaseBaseline>(path.join(target, "release-baseline.json"), "版本基线");
  let change: ReleaseChangeReport | undefined; try { change = await readJson<ReleaseChangeReport>(path.join(target, "release-change-report.json"), "版本变更报告"); } catch {}
  return { baseline, change };
}

export function renderReleaseChangeReport(report: ReleaseChangeReport): string {
  return `# ${report.productVersion} 版本变化报告\n\n- 结论：${report.status}\n- 基线：#${report.baselineSequence}\n- 版本确认失效：${report.invalidatedConfirmation ? "是" : "否"}\n\n| 变化 | 内容 |\n|---|---|\n| 新增需求 | ${report.changes.addedRequirements.join("、") || "无"} |\n| 移除需求 | ${report.changes.removedRequirements.join("、") || "无"} |\n| 修订变化 | ${report.changes.revisedRequirements.join("、") || "无"} |\n| 准入变化 | ${report.changes.admissionChanges.join("、") || "无"} |\n| 无效纳入需求 | ${report.changes.invalidIncludedRequirements.join("、") || "无"} |\n| 关系变化 | ${report.changes.relationshipChanged ? "是" : "否"} |\n`;
}
