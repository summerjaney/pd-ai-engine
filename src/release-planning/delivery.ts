import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzePortfolioRelationships, assessRequirementPortfolio, buildRequirementPortfolio } from "../release-portfolio/service.js";
import { detectReleaseChanges, readReleaseStatus } from "./baseline.js";

const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const directory = (projectDirectory: string, version: string): string => path.join(projectDirectory, "releases", `v${version.replace(/^v/, "")}`);

export interface ReleasePlanningAcceptance {
  schemaVersion: "1.7";
  productVersion: string;
  status: "PASS" | "FAIL";
  checks: Array<{ id: string; status: "PASS" | "FAIL"; message: string }>;
  summary: { includedRequirements: number; deferredRequirements: number; modules: number; risks: number; regressionModules: number };
}

export async function finalizeReleasePlanning(projectDirectory: string, versionValue: string, objective: string): Promise<{ acceptance: ReleasePlanningAcceptance; directory: string; manifestPath: string; acceptancePath: string }> {
  const productVersion = versionValue.replace(/^v/, "");
  if (!objective.trim()) throw new Error("版本目标不能为空。");
  const [{ baseline }, changeResult, { portfolio }, { assessment }, { analysis }] = await Promise.all([
    readReleaseStatus(projectDirectory, productVersion), detectReleaseChanges(projectDirectory, productVersion), buildRequirementPortfolio(projectDirectory), assessRequirementPortfolio(projectDirectory), analyzePortfolioRelationships(projectDirectory),
  ]);
  const includedIds = baseline.includedRequirements.map((item) => item.requirementId);
  const included = portfolio.requirements.filter((item) => includedIds.includes(item.requirementId));
  const includedAssessments = assessment.requirements.filter((item) => includedIds.includes(item.requirementId));
  const blockingRelations = analysis.relationships.filter((item) => item.severity === "BLOCKER" && includedIds.includes(item.sourceRequirementId) && includedIds.includes(item.targetRequirementId));
  const modules = [...new Set(included.flatMap((item) => item.moduleIds))].sort();
  const regressionModules = [...new Set(analysis.relationships.filter((item) => item.type === "shares-regression-scope" && includedIds.includes(item.sourceRequirementId) && includedIds.includes(item.targetRequirementId)).flatMap((item) => item.moduleIds))].sort();
  const checks: ReleasePlanningAcceptance["checks"] = [
    { id: "baseline-current", status: changeResult.report.status === "CURRENT" ? "PASS" : "FAIL", message: changeResult.report.status === "CURRENT" ? "版本基线仍然有效。" : "版本基线已发生变化。" },
    { id: "admission-ready", status: included.every((item) => item.admissionStatus === "READY") ? "PASS" : "FAIL", message: included.every((item) => item.admissionStatus === "READY") ? "全部纳入需求均已准入。" : "存在未达到 READY 的纳入需求。" },
    { id: "pm-value-review", status: includedAssessments.every((item) => item.reviewStatus === "CONFIRMED") ? "PASS" : "FAIL", message: includedAssessments.every((item) => item.reviewStatus === "CONFIRMED") ? "业务价值评分已由产品经理确认。" : "存在尚未完成产品经理复核的业务评分。" },
    { id: "relationship-blockers", status: blockingRelations.length ? "FAIL" : "PASS", message: blockingRelations.length ? `仍有 ${blockingRelations.length} 个阻断关系。` : "版本范围内不存在阻断关系。" },
  ];
  const status = checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL";
  const target = directory(projectDirectory, productVersion); await mkdir(target, { recursive: true });
  const matrixRows = included.map((item) => { const score = includedAssessments.find((entry) => entry.requirementId === item.requirementId); return `| ${item.requirementId} | ${item.requirementName} | ${item.revision} | ${score?.finalPriorityScore ?? "-"} | ${score?.priorityBand ?? "-"} | ${item.moduleIds.join("、") || "-"} | ${item.designUnitCount} |`; }).join("\n");
  const riskRows = includedAssessments.filter((item) => item.deliveryCost.average >= 3).map((item) => `| RISK-${item.requirementId} | ${item.requirementId} | 交付成本指数 ${item.deliveryCost.average} | ${item.deliveryCost.average >= 4 ? "HIGH" : "MEDIUM"} | 产品、开发和测试联合评审 |`).join("\n") || "| - | - | 当前未识别高成本需求 | LOW | 持续监控 |";
  const artifacts: Record<string, string> = {
    "release-plan.md": `# ${productVersion} 版本规划\n\n## 版本目标\n\n${objective.trim()}\n\n## 版本范围\n\n- 纳入：${includedIds.join("、")}\n- 延期：${baseline.deferredRequirementIds.join("、") || "无"}\n- 平台模块：${modules.join("、") || "无"}\n- 基线：#${baseline.sequence}\n`,
    "requirement-matrix.md": `# 版本需求矩阵\n\n| 需求编号 | 名称 | 修订 | 优先级分数 | 优先级 | 模块 | 设计单元 |\n|---|---|---:|---:|---|---|---:|\n${matrixRows}\n`,
    "module-impact-matrix.md": `# 平台模块影响矩阵\n\n${modules.map((moduleId) => `- ${moduleId}：${included.filter((item) => item.moduleIds.includes(moduleId)).map((item) => item.requirementId).join("、")}`).join("\n")}\n`,
    "dependency-summary.md": `# 版本依赖与关系\n\n${analysis.relationships.filter((item) => includedIds.includes(item.sourceRequirementId) && includedIds.includes(item.targetRequirementId)).map((item) => `- ${item.sourceRequirementId} --${item.type}--> ${item.targetRequirementId}：${item.reason}`).join("\n") || "- 当前版本范围内无跨需求关系。"}\n`,
    "risk-register.md": `# 版本风险登记\n\n| 风险ID | 需求 | 风险 | 等级 | 建议措施 |\n|---|---|---|---|---|\n${riskRows}\n`,
    "regression-scope.md": `# 版本回归范围\n\n## 共享回归模块\n\n${regressionModules.map((item) => `- ${item}`).join("\n") || "- 无共享回归模块。"}\n\n## 全量影响模块\n\n${modules.map((item) => `- ${item}`).join("\n")}\n`,
  };
  await Promise.all(Object.entries(artifacts).map(([name, content]) => writeFile(path.join(target, name), content, "utf8")));
  const acceptance: ReleasePlanningAcceptance = { schemaVersion: "1.7", productVersion, status, checks, summary: { includedRequirements: included.length, deferredRequirements: baseline.deferredRequirementIds.length, modules: modules.length, risks: includedAssessments.filter((item) => item.deliveryCost.average >= 3).length, regressionModules: regressionModules.length } };
  const acceptancePath = path.join(target, "release-planning-acceptance.json"); await writeFile(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, "utf8");
  const files = [...Object.keys(artifacts), path.basename(acceptancePath)]; const manifest = { schemaVersion: "1.7", productVersion, status, generatedAt: new Date().toISOString(), files: await Promise.all(files.map(async (name) => ({ name, sha256: hash(await readFile(path.join(target, name))) }))) };
  const manifestPath = path.join(target, "release-planning-manifest.json"); await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (status !== "PASS") throw new Error(`版本规划整合验收失败：${checks.filter((item) => item.status === "FAIL").map((item) => item.message).join("；")}`);
  return { acceptance, directory: target, manifestPath, acceptancePath };
}
