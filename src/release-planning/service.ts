import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzePortfolioRelationships, assessRequirementPortfolio, buildRequirementPortfolio } from "../release-portfolio/service.js";
import type { PortfolioAssessment, PortfolioRelationshipAnalysis, RequirementPortfolio } from "../release-portfolio/types.js";
import type { ReleaseCandidateOption, ReleaseOptionId, ReleaseOptionSet, ReleaseScopeDecision } from "./types.js";

const hash = (value: unknown): string => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const releaseDirectory = (projectDirectory: string, version: string): string => path.join(projectDirectory, "releases", `v${version.replace(/^v/, "")}`);

function safeVersion(value: string): string {
  const normalized = value.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(normalized)) throw new Error("版本号必须使用 SemVer，例如 2.1.0。");
  return normalized;
}

function requirementCost(assessment: PortfolioAssessment, id: string): number { return assessment.requirements.find((item) => item.requirementId === id)?.deliveryCost.average ?? 5; }
function priority(assessment: PortfolioAssessment, id: string): number { const item = assessment.requirements.find((entry) => entry.requirementId === id); return item?.finalPriorityScore ?? item?.technicalPriorityIndex ?? 0; }
function reuse(assessment: PortfolioAssessment, id: string): number { return assessment.requirements.find((item) => item.requirementId === id)?.structuralValue.platformReuse ?? 0; }

function buildOption(id: ReleaseOptionId, name: string, rationale: string[], included: string[], portfolio: RequirementPortfolio, assessment: PortfolioAssessment, relations: PortfolioRelationshipAnalysis): ReleaseCandidateOption {
  const unique = [...new Set(included)].sort();
  const modules = [...new Set(portfolio.requirements.filter((item) => unique.includes(item.requirementId)).flatMap((item) => item.moduleIds))].sort();
  const estimatedCost = Number(unique.reduce((total, requirementId) => total + requirementCost(assessment, requirementId), 0).toFixed(2));
  const blockerRelationshipIds = relations.relationships.filter((item) => item.severity === "BLOCKER" && unique.includes(item.sourceRequirementId) && unique.includes(item.targetRequirementId)).map((item) => item.id).sort();
  const averageCost = unique.length ? estimatedCost / unique.length : 5;
  const riskLevel = blockerRelationshipIds.length || averageCost >= 4 ? "HIGH" : averageCost >= 2.5 ? "MEDIUM" : "LOW";
  return { id, name, rationale, includedRequirementIds: unique, deferredRequirementIds: portfolio.requirements.map((item) => item.requirementId).filter((item) => !unique.includes(item)).sort(), moduleIds: modules, estimatedCost, riskLevel, blockerRelationshipIds };
}

export async function generateReleaseOptions(projectDirectory: string, versionValue: string): Promise<{ optionSet: ReleaseOptionSet; jsonPath: string; markdownPath: string }> {
  const productVersion = safeVersion(versionValue);
  const [{ portfolio }, { assessment }, { analysis }] = await Promise.all([buildRequirementPortfolio(projectDirectory), assessRequirementPortfolio(projectDirectory), analyzePortfolioRelationships(projectDirectory)]);
  const eligible = portfolio.requirements.filter((item) => item.admissionStatus === "READY" || item.admissionStatus === "CONDITIONAL").map((item) => item.requirementId);
  const ready = portfolio.requirements.filter((item) => item.admissionStatus === "READY").map((item) => item.requirementId);
  const foundation = [...eligible].sort((a, b) => reuse(assessment, b) - reuse(assessment, a) || priority(assessment, b) - priority(assessment, a)).slice(0, Math.max(1, Math.ceil(eligible.length * 0.7)));
  const value = [...eligible].sort((a, b) => priority(assessment, b) - priority(assessment, a)).slice(0, Math.max(1, Math.ceil(eligible.length * 0.7)));
  const risk = [...ready].sort((a, b) => requirementCost(assessment, a) - requirementCost(assessment, b) || priority(assessment, b) - priority(assessment, a)).slice(0, Math.max(1, Math.ceil(ready.length * 0.6)));
  const options = [
    buildOption("foundation-first", "核心能力优先", ["优先平台复用价值高的基础能力。", "为后续需求减少重复建设。"], foundation, portfolio, assessment, analysis),
    buildOption("value-first", "客户与业务价值优先", ["优先最终分数或技术建议指数较高的需求。", "业务评分未确认时保留人工复核提示。"], value, portfolio, assessment, analysis),
    buildOption("risk-control", "风险控制优先", ["只纳入已达到 READY 的需求。", "优先交付成本较低且依赖稳定的需求。"], risk, portfolio, assessment, analysis),
  ];
  const inputFingerprint = hash({ portfolio: portfolio.requirements, assessment: assessment.requirements, relations: analysis.relationships });
  const optionSet: ReleaseOptionSet = { schemaVersion: "1.7", productVersion, generatedAt: new Date().toISOString(), inputFingerprint, status: "pending-product-manager-selection", options };
  const target = releaseDirectory(projectDirectory, productVersion); await mkdir(target, { recursive: true });
  const jsonPath = path.join(target, "release-options.json"); const markdownPath = path.join(target, "release-options.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(optionSet, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderReleaseOptions(optionSet), "utf8")]);
  return { optionSet, jsonPath, markdownPath };
}

export async function readReleaseOptions(projectDirectory: string, versionValue: string): Promise<ReleaseOptionSet> {
  const productVersion = safeVersion(versionValue);
  try { return JSON.parse(await readFile(path.join(releaseDirectory(projectDirectory, productVersion), "release-options.json"), "utf8")) as ReleaseOptionSet; }
  catch (error) { throw new Error(`无法读取版本候选方案：${(error as Error).message}`); }
}

export async function selectReleaseScope(projectDirectory: string, versionValue: string, optionId: ReleaseOptionId, include?: string[], defer?: string[], note?: string): Promise<{ decision: ReleaseScopeDecision; path: string }> {
  const productVersion = safeVersion(versionValue); const optionSet = await readReleaseOptions(projectDirectory, productVersion);
  const [{ portfolio }, { analysis }] = await Promise.all([buildRequirementPortfolio(projectDirectory), analyzePortfolioRelationships(projectDirectory)]);
  const currentFingerprint = hash({ portfolio: portfolio.requirements, assessment: (await assessRequirementPortfolio(projectDirectory)).assessment.requirements, relations: analysis.relationships });
  if (currentFingerprint !== optionSet.inputFingerprint) throw new Error("版本方案选择被阻断：需求组合、评分或关系分析已经变化，请重新生成候选方案。");
  const selected = optionSet.options.find((item) => item.id === optionId); if (!selected) throw new Error(`未知版本方案：${optionId}`);
  const known = new Set(portfolio.requirements.map((item) => item.requirementId));
  const included = [...new Set(include?.length ? include : selected.includedRequirementIds)].sort();
  const deferred = [...new Set(defer?.length ? defer : portfolio.requirements.map((item) => item.requirementId).filter((id) => !included.includes(id)))].sort();
  for (const id of [...included, ...deferred]) if (!known.has(id)) throw new Error(`版本范围包含未知需求：${id}`);
  const forbidden = portfolio.requirements.filter((item) => included.includes(item.requirementId) && ["BLOCKED", "STALE"].includes(item.admissionStatus));
  if (forbidden.length) throw new Error(`版本范围选择被阻断：以下需求不可准入：${forbidden.map((item) => `${item.requirementId}(${item.admissionStatus})`).join("、")}`);
  const missingDependencies = analysis.relationships.filter((item) => item.type === "depends-on" && included.includes(item.sourceRequirementId) && !included.includes(item.targetRequirementId));
  if (missingDependencies.length) throw new Error(`版本范围选择被阻断：缺少前置依赖 ${missingDependencies.map((item) => `${item.sourceRequirementId}->${item.targetRequirementId}`).join("、")}`);
  const decision: ReleaseScopeDecision = { schemaVersion: "1.7", productVersion, status: "selected", optionSetFingerprint: hash(optionSet), selectedOptionId: optionId, includedRequirementIds: included, deferredRequirementIds: deferred, note, selectedAt: new Date().toISOString(), selectedBy: "product-manager" };
  const target = path.join(releaseDirectory(projectDirectory, productVersion), "release-scope-decision.json"); await writeFile(target, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
  return { decision, path: target };
}

export function renderReleaseOptions(optionSet: ReleaseOptionSet): string {
  const sections = optionSet.options.map((item) => `## ${item.name}（${item.id}）\n\n- 纳入：${item.includedRequirementIds.join("、") || "无"}\n- 延期：${item.deferredRequirementIds.join("、") || "无"}\n- 模块：${item.moduleIds.join("、") || "无"}\n- 估算成本指数：${item.estimatedCost}\n- 风险：${item.riskLevel}\n- 阻断关系：${item.blockerRelationshipIds.join("、") || "无"}\n\n${item.rationale.map((reason) => `- ${reason}`).join("\n")}`).join("\n\n");
  return `# ${optionSet.productVersion} 版本候选方案\n\n- 状态：${optionSet.status}\n- 输入指纹：${optionSet.inputFingerprint}\n\n${sections}\n`;
}
