import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PortfolioAdmissionCheck, PortfolioAssessment, PortfolioRelationshipAnalysis, PortfolioRequirement, ProductManagerValueReview, ReleaseAdmissionStatus, RequirementAssessment, RequirementPortfolio, RequirementRelationship, RequirementRelationshipType } from "./types.js";

async function optionalJson<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

function admissionStatus(checks: PortfolioAdmissionCheck[]): ReleaseAdmissionStatus {
  if (checks.some((check) => check.id === "change-status" && check.status === "FAIL")) return "STALE";
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (checks.some((check) => check.status === "PENDING" || check.status === "NOT_AVAILABLE")) return "CONDITIONAL";
  return "READY";
}

async function inspectRequirement(projectDirectory: string, entry: string): Promise<PortfolioRequirement> {
  const directory = path.join(projectDirectory, "requirements", entry);
  const metadata = await optionalJson<{ requirementId?: string; requirementName?: string; productVersion?: string; revision?: number }>(path.join(directory, "requirement.json"));
  const decision = await optionalJson<{ status?: string; selectedOptionId?: string }>(path.join(directory, "02-product-outline", "solution-options", "solution-decision.json"));
  const plan = await optionalJson<{ units?: Array<{ moduleId?: string }> }>(path.join(directory, "02-product-outline", "design-units", "design-unit-plan.json"));
  const acceptance = await optionalJson<{ status?: string }>(path.join(directory, "12-acceptance", "complex-requirement", "acceptance-report.json"));
  const change = await optionalJson<{ status?: string }>(path.join(directory, "11-change-impact", "requirement-change", "requirement-change-report.json"));
  const checks: PortfolioAdmissionCheck[] = [
    { id: "requirement-metadata", status: metadata?.requirementId && metadata.requirementName ? "PASS" : "FAIL", message: metadata ? "需求元数据已登记。" : "缺少 requirement.json。" },
    { id: "solution-selection", status: decision?.status === "selected" ? "PASS" : "PENDING", message: decision?.status === "selected" ? `已选择方案 ${decision.selectedOptionId}。` : "尚未完成产品经理方案选择。" },
    { id: "design-units", status: plan?.units?.length ? "PASS" : "PENDING", message: plan?.units?.length ? `已建立 ${plan.units.length} 个设计单元。` : "尚未建立设计单元计划。" },
    { id: "complex-acceptance", status: acceptance?.status === "PASS" ? "PASS" : acceptance?.status === "FAIL" ? "FAIL" : "NOT_AVAILABLE", message: acceptance?.status === "PASS" ? "复杂需求整合验收通过。" : acceptance?.status === "FAIL" ? "复杂需求整合验收失败。" : "尚未完成复杂需求整合验收。" },
    { id: "change-status", status: change?.status === "CHANGE_DETECTED" ? "FAIL" : "PASS", message: change?.status === "CHANGE_DETECTED" ? "需求变化已使正式设计失效。" : "未发现使设计失效的增量变化。" },
  ];
  const fallbackId = entry.split("-")[0] ?? entry;
  return {
    requirementId: metadata?.requirementId ?? fallbackId,
    requirementName: metadata?.requirementName ?? entry.slice(fallbackId.length + 1),
    productVersion: metadata?.productVersion ?? "unknown",
    revision: metadata?.revision ?? 0,
    directory: path.relative(projectDirectory, directory),
    admissionStatus: admissionStatus(checks), selectedOptionId: decision?.selectedOptionId,
    moduleIds: [...new Set((plan?.units ?? []).flatMap((unit) => unit.moduleId ? [unit.moduleId] : []))].sort(),
    designUnitCount: plan?.units?.length ?? 0, checks,
  };
}

export async function buildRequirementPortfolio(projectDirectory: string): Promise<{ portfolio: RequirementPortfolio; jsonPath: string; markdownPath: string }> {
  const project = await optionalJson<{ projectId?: string; projectName?: string }>(path.join(projectDirectory, "project.json"));
  if (!project?.projectId) throw new Error("无法建立需求组合：项目缺少有效的 project.json。");
  let entries: string[];
  try { entries = (await readdir(path.join(projectDirectory, "requirements"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(); }
  catch { throw new Error("无法建立需求组合：项目不存在 requirements 目录。"); }
  const requirements = await Promise.all(entries.map((entry) => inspectRequirement(projectDirectory, entry)));
  const summary = { total: requirements.length, READY: 0, CONDITIONAL: 0, BLOCKED: 0, STALE: 0 };
  for (const requirement of requirements) summary[requirement.admissionStatus] += 1;
  const portfolio: RequirementPortfolio = { schemaVersion: "1.7", generatedAt: new Date().toISOString(), project: { id: project.projectId, name: project.projectName ?? project.projectId }, requirements, summary };
  const target = path.join(projectDirectory, "product", "portfolio");
  await mkdir(target, { recursive: true });
  const jsonPath = path.join(target, "requirement-portfolio.json");
  const markdownPath = path.join(target, "requirement-portfolio.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(portfolio, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderRequirementPortfolio(portfolio), "utf8")]);
  return { portfolio, jsonPath, markdownPath };
}

export function renderRequirementPortfolio(portfolio: RequirementPortfolio): string {
  const rows = portfolio.requirements.map((item) => `| ${item.requirementId} | ${item.requirementName} | ${item.productVersion} | ${item.revision} | ${item.admissionStatus} | ${item.selectedOptionId ?? "-"} | ${item.moduleIds.join("、") || "-"} | ${item.designUnitCount} |`).join("\n");
  return `# 需求组合与版本准入\n\n- 项目：${portfolio.project.name}（${portfolio.project.id}）\n- 候选需求：${portfolio.summary.total}\n- READY / CONDITIONAL / BLOCKED / STALE：${portfolio.summary.READY} / ${portfolio.summary.CONDITIONAL} / ${portfolio.summary.BLOCKED} / ${portfolio.summary.STALE}\n\n| 需求编号 | 需求名称 | 目标版本 | 修订 | 准入状态 | 已选方案 | 影响模块 | 设计单元 |\n|---|---|---|---:|---|---|---|---:|\n${rows}\n`;
}

const emptyReview = (): ProductManagerValueReview => ({ businessUrgency: null, customerCoverage: null, strategicAlignment: null, note: "" });

function optionReuse(optionId?: string): number {
  if (optionId === "platform-enhancement") return 5;
  if (optionId === "product-extension") return 4;
  if (optionId === "configuration") return 3;
  if (optionId === "architecture-assessment") return 2;
  return 1;
}

function optionRisk(optionId?: string): number {
  if (optionId === "architecture-assessment") return 5;
  if (optionId === "platform-enhancement") return 4;
  if (optionId === "product-extension") return 3;
  if (optionId === "project-customization") return 2;
  return 1;
}

function validReview(review: ProductManagerValueReview): boolean {
  return [review.businessUrgency, review.customerCoverage, review.strategicAlignment].every((value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5);
}

function assessRequirement(item: PortfolioRequirement, review: ProductManagerValueReview): RequirementAssessment {
  const moduleCount = item.moduleIds.length;
  const structuralValue = { platformReuse: optionReuse(item.selectedOptionId), scenarioCoverage: Math.min(5, Math.max(1, moduleCount)) };
  const deliveryCost = {
    designComplexity: Math.min(5, Math.max(1, Math.ceil(item.designUnitCount / 4))),
    moduleBreadth: Math.min(5, Math.max(1, moduleCount)),
    implementationRisk: optionRisk(item.selectedOptionId),
    regressionScope: Math.min(5, Math.max(1, Math.ceil(moduleCount / 2))),
    average: 0,
  };
  deliveryCost.average = Number(((deliveryCost.designComplexity + deliveryCost.moduleBreadth + deliveryCost.implementationRisk + deliveryCost.regressionScope) / 4).toFixed(2));
  const readiness = item.admissionStatus === "READY" ? 5 : item.admissionStatus === "CONDITIONAL" ? 3 : 1;
  const technicalPriorityIndex = Math.round((((structuralValue.platformReuse + structuralValue.scenarioCoverage) / 2) * 0.45 + (6 - deliveryCost.average) * 0.35 + readiness * 0.2) * 20);
  const assessment: RequirementAssessment = {
    requirementId: item.requirementId, admissionStatus: item.admissionStatus,
    evidence: { moduleCount, designUnitCount: item.designUnitCount, selectedOptionId: item.selectedOptionId },
    structuralValue, deliveryCost, productManagerReview: review,
    reviewStatus: validReview(review) ? "CONFIRMED" : "AWAITING_PM_REVIEW", technicalPriorityIndex,
  };
  if (assessment.reviewStatus === "CONFIRMED") {
    const businessValue = (Number(review.businessUrgency) + Number(review.customerCoverage) + Number(review.strategicAlignment) + structuralValue.platformReuse + structuralValue.scenarioCoverage) / 5;
    assessment.finalPriorityScore = Math.round((businessValue * 0.6 + (6 - deliveryCost.average) * 0.25 + readiness * 0.15) * 20);
    assessment.priorityBand = assessment.finalPriorityScore >= 85 ? "P0" : assessment.finalPriorityScore >= 70 ? "P1" : assessment.finalPriorityScore >= 50 ? "P2" : "P3";
  }
  return assessment;
}

export async function assessRequirementPortfolio(projectDirectory: string): Promise<{ assessment: PortfolioAssessment; jsonPath: string; markdownPath: string; reviewPath: string }> {
  const { portfolio } = await buildRequirementPortfolio(projectDirectory);
  const target = path.join(projectDirectory, "product", "portfolio");
  const reviewPath = path.join(target, "product-manager-review.json");
  const existing = await optionalJson<{ schemaVersion?: string; reviews?: Record<string, ProductManagerValueReview> }>(reviewPath);
  const reviews: Record<string, ProductManagerValueReview> = {};
  for (const item of portfolio.requirements) reviews[item.requirementId] = existing?.reviews?.[item.requirementId] ?? emptyReview();
  if (!existing) await writeFile(reviewPath, `${JSON.stringify({ schemaVersion: "1.7", reviews }, null, 2)}\n`, "utf8");
  const requirements = portfolio.requirements.map((item) => assessRequirement(item, reviews[item.requirementId] ?? emptyReview()))
    .sort((left, right) => (right.finalPriorityScore ?? right.technicalPriorityIndex) - (left.finalPriorityScore ?? left.technicalPriorityIndex) || left.requirementId.localeCompare(right.requirementId));
  const confirmed = requirements.filter((item) => item.reviewStatus === "CONFIRMED").length;
  const assessment: PortfolioAssessment = { schemaVersion: "1.7", generatedAt: new Date().toISOString(), portfolioGeneratedAt: portfolio.generatedAt, requirements, summary: { total: requirements.length, confirmed, awaitingReview: requirements.length - confirmed } };
  const jsonPath = path.join(target, "portfolio-assessment.json");
  const markdownPath = path.join(target, "portfolio-assessment.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(assessment, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderPortfolioAssessment(assessment), "utf8")]);
  return { assessment, jsonPath, markdownPath, reviewPath };
}

export function renderPortfolioAssessment(assessment: PortfolioAssessment): string {
  const rows = assessment.requirements.map((item) => `| ${item.requirementId} | ${item.admissionStatus} | ${item.structuralValue.platformReuse}/${item.structuralValue.scenarioCoverage} | ${item.deliveryCost.average} | ${item.technicalPriorityIndex} | ${item.reviewStatus} | ${item.finalPriorityScore ?? "-"} | ${item.priorityBand ?? "-"} |`).join("\n");
  return `# 需求价值、成本与优先级评估\n\n- 候选需求：${assessment.summary.total}\n- 已确认：${assessment.summary.confirmed}\n- 待产品经理复核：${assessment.summary.awaitingReview}\n\n| 需求 | 准入 | 平台复用/场景覆盖 | 交付成本 | 技术建议指数 | 人工复核 | 最终分数 | 优先级 |\n|---|---|---|---:|---:|---|---:|---|\n${rows}\n\n> 技术建议指数只使用可追踪的结构数据，不等同于最终业务优先级。填写 product-manager-review.json 后重新执行评估，才会生成最终分数和 P0–P3 建议。\n`;
}

interface RelationshipEvidence {
  direct: string[];
  indirect: string[];
  regression: string[];
  edges: Array<{ from: string; to: string; type: string; reason: string }>;
}

async function loadRelationshipEvidence(projectDirectory: string, item: PortfolioRequirement): Promise<RelationshipEvidence> {
  const report = await optionalJson<{ impacts?: Array<{ moduleId?: string; level?: string }>; dependencyEdges?: RelationshipEvidence["edges"] }>(path.join(projectDirectory, item.directory, "00-platform-analysis", "cross-module-impact", "module-impact-report.json"));
  const impacts = report?.impacts ?? [];
  const byLevel = (level: string): string[] => impacts.filter((impact) => impact.level === level && impact.moduleId).map((impact) => impact.moduleId!).sort();
  return { direct: byLevel("DIRECT"), indirect: byLevel("INDIRECT"), regression: byLevel("REGRESSION"), edges: report?.dependencyEdges ?? [] };
}

function intersection(left: string[], right: string[]): string[] { const values = new Set(right); return [...new Set(left.filter((item) => values.has(item)))].sort(); }

function relationship(source: PortfolioRequirement, target: PortfolioRequirement, type: RequirementRelationshipType, moduleIds: string[], reason: string, evidence: string[], severity: RequirementRelationship["severity"], review = false): RequirementRelationship {
  return { id: `REL-${source.requirementId}-${target.requirementId}-${type}`.replace(/[^A-Za-z0-9-]/g, "-"), sourceRequirementId: source.requirementId, targetRequirementId: target.requirementId, type, severity, moduleIds, reason, evidence, requiresProductManagerReview: review };
}

function analyzePair(left: PortfolioRequirement, right: PortfolioRequirement, leftEvidence: RelationshipEvidence, rightEvidence: RelationshipEvidence): RequirementRelationship[] {
  const results: RequirementRelationship[] = [];
  const shared = intersection(left.moduleIds, right.moduleIds);
  const sharedDirect = intersection(leftEvidence.direct, rightEvidence.direct);
  const leftEnablesRight = intersection(leftEvidence.direct, [...rightEvidence.indirect, ...rightEvidence.regression]);
  const rightEnablesLeft = intersection(rightEvidence.direct, [...leftEvidence.indirect, ...leftEvidence.regression]);
  if (shared.length) results.push(relationship(left, right, "overlaps-with", shared, "两个需求影响相同的平台模块，需要合并检查设计边界。", shared.map((id) => `shared-module:${id}`), sharedDirect.length ? "IMPORTANT" : "INFO"));
  if (leftEnablesRight.length) {
    results.push(relationship(left, right, "enables", leftEnablesRight, `${left.requirementId} 的直接变更为 ${right.requirementId} 提供基础能力。`, leftEnablesRight.map((id) => `direct-to-indirect:${id}`), "IMPORTANT"));
    results.push(relationship(right, left, "depends-on", leftEnablesRight, `${right.requirementId} 依赖 ${left.requirementId} 直接建设的模块能力。`, leftEnablesRight.map((id) => `dependency-module:${id}`), "BLOCKER"));
  }
  if (rightEnablesLeft.length) {
    results.push(relationship(right, left, "enables", rightEnablesLeft, `${right.requirementId} 的直接变更为 ${left.requirementId} 提供基础能力。`, rightEnablesLeft.map((id) => `direct-to-indirect:${id}`), "IMPORTANT"));
    results.push(relationship(left, right, "depends-on", rightEnablesLeft, `${left.requirementId} 依赖 ${right.requirementId} 直接建设的模块能力。`, rightEnablesLeft.map((id) => `dependency-module:${id}`), "BLOCKER"));
  }
  const sharedRegression = intersection([...leftEvidence.direct, ...leftEvidence.regression], [...rightEvidence.direct, ...rightEvidence.regression]);
  if (sharedRegression.length) results.push(relationship(left, right, "shares-regression-scope", sharedRegression, "两个需求共享回归模块，应合并安排测试范围。", sharedRegression.map((id) => `regression-module:${id}`), "IMPORTANT"));
  if (sharedDirect.length && left.selectedOptionId && right.selectedOptionId && left.selectedOptionId !== right.selectedOptionId) results.push(relationship(left, right, "conflicts-with", sharedDirect, "同一直接影响模块采用了不同实施路径，需要产品经理确认统一边界。", [`option:${left.selectedOptionId}`, `option:${right.selectedOptionId}`, ...sharedDirect.map((id) => `direct-module:${id}`)], "BLOCKER", true));
  if (shared.length >= 2 && left.admissionStatus === "READY" && right.admissionStatus === "READY") results.push(relationship(left, right, "should-bundle-with", shared, "两个已准入需求共享多个模块，同版本实施可减少重复设计和回归成本。", shared.map((id) => `bundle-module:${id}`), "IMPORTANT", true));
  return results;
}

export async function analyzePortfolioRelationships(projectDirectory: string): Promise<{ analysis: PortfolioRelationshipAnalysis; jsonPath: string; markdownPath: string; graphPath: string }> {
  const { portfolio } = await buildRequirementPortfolio(projectDirectory);
  const evidence = new Map<string, RelationshipEvidence>();
  for (const item of portfolio.requirements) evidence.set(item.requirementId, await loadRelationshipEvidence(projectDirectory, item));
  const relationships: RequirementRelationship[] = [];
  for (let i = 0; i < portfolio.requirements.length; i += 1) for (let j = i + 1; j < portfolio.requirements.length; j += 1) {
    const left = portfolio.requirements[i]; const right = portfolio.requirements[j];
    relationships.push(...analyzePair(left, right, evidence.get(left.requirementId)!, evidence.get(right.requirementId)!));
  }
  relationships.sort((a, b) => a.id.localeCompare(b.id));
  const summary: PortfolioRelationshipAnalysis["summary"] = { total: relationships.length, blocker: relationships.filter((item) => item.severity === "BLOCKER").length, "depends-on": 0, "conflicts-with": 0, "overlaps-with": 0, enables: 0, "should-bundle-with": 0, "shares-regression-scope": 0 };
  for (const item of relationships) summary[item.type] += 1;
  const analysis: PortfolioRelationshipAnalysis = { schemaVersion: "1.7", generatedAt: new Date().toISOString(), relationships, summary };
  const target = path.join(projectDirectory, "product", "portfolio"); await mkdir(target, { recursive: true });
  const jsonPath = path.join(target, "requirement-relationships.json"); const markdownPath = path.join(target, "requirement-relationships.md"); const graphPath = path.join(target, "requirement-relationships.mmd");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderPortfolioRelationships(analysis), "utf8"), writeFile(graphPath, renderPortfolioRelationshipGraph(analysis), "utf8")]);
  return { analysis, jsonPath, markdownPath, graphPath };
}

export function renderPortfolioRelationships(analysis: PortfolioRelationshipAnalysis): string {
  const rows = analysis.relationships.map((item) => `| ${item.sourceRequirementId} | ${item.type} | ${item.targetRequirementId} | ${item.severity} | ${item.moduleIds.join("、") || "-"} | ${item.reason} |`).join("\n");
  return `# 跨需求关系分析\n\n- 关系：${analysis.summary.total}\n- 阻断关系：${analysis.summary.blocker}\n- 依赖/冲突/重叠：${analysis.summary["depends-on"]}/${analysis.summary["conflicts-with"]}/${analysis.summary["overlaps-with"]}\n\n| 来源需求 | 关系 | 目标需求 | 严重度 | 模块 | 原因 |\n|---|---|---|---|---|---|\n${rows}\n`;
}

export function renderPortfolioRelationshipGraph(analysis: PortfolioRelationshipAnalysis): string {
  const nodes = [...new Set(analysis.relationships.flatMap((item) => [item.sourceRequirementId, item.targetRequirementId]))].sort();
  const lines = analysis.relationships.filter((item) => ["depends-on", "conflicts-with", "should-bundle-with"].includes(item.type)).map((item) => `  ${item.sourceRequirementId.replace(/-/g, "_")} -->|${item.type}| ${item.targetRequirementId.replace(/-/g, "_")}`);
  return `flowchart TD\n${nodes.map((id) => `  ${id.replace(/-/g, "_")}["${id}"]`).join("\n")}\n${lines.join("\n")}\n`;
}
