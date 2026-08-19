import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareRequirementOutput } from "../output/requirement-output.js";
import { buildRequirementPortfolio } from "../release-portfolio/service.js";
import type { CompetitorAnalysisReport, CompetitorCandidate, CompetitorCandidateBacklog, CompetitorDecision, CompetitorFeature, CompetitorFeatureAssessment, CompetitorPriorityReviewItem, CompetitorProfile, CompetitorReview, PlatformCapabilityBaseline } from "./types.js";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const hashReport = (report: CompetitorAnalysisReport): string => hash(JSON.stringify(report));

function assertProfile(value: CompetitorProfile): void {
  if (value.schemaVersion !== "1.8" || !value.id || !value.name || !Array.isArray(value.features) || !Array.isArray(value.evidence)) throw new Error("竞品档案结构无效。");
  const evidenceIds = new Set(value.evidence.map((item) => item.id));
  const featureIds = new Set<string>();
  for (const feature of value.features) {
    if (!feature.id || featureIds.has(feature.id) || !feature.name || !feature.module || !feature.scenario) throw new Error(`竞品功能结构无效或ID重复：${feature.id || "unknown"}`);
    featureIds.add(feature.id);
    if (!feature.evidenceIds.length || feature.evidenceIds.some((id) => !evidenceIds.has(id))) throw new Error(`竞品功能缺少有效证据：${feature.id}`);
  }
}

function assertBaseline(value: PlatformCapabilityBaseline): void {
  if (value.schemaVersion !== "1.8" || !value.product?.id || !Array.isArray(value.capabilities)) throw new Error("平台能力基线结构无效。");
}

function normalized(values: string[]): Set<string> {
  return new Set(values.map((item) => item.trim().toLowerCase()).filter(Boolean));
}

function overlap(feature: CompetitorFeature, capability: PlatformCapabilityBaseline["capabilities"][number]): number {
  const featureTerms = normalized([feature.module, feature.name, ...feature.keywords]);
  const capabilityTerms = normalized([capability.module, capability.name, ...capability.keywords]);
  return [...featureTerms].filter((item) => capabilityTerms.has(item)).length;
}

function assess(feature: CompetitorFeature, baseline: PlatformCapabilityBaseline): CompetitorFeatureAssessment {
  const matches = baseline.capabilities.map((capability) => ({ capability, score: overlap(feature, capability) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.capability.id.localeCompare(b.capability.id));
  const best = matches[0]?.score ?? 0;
  const matchedCapabilityIds = matches.filter((item) => item.score === best).map((item) => item.capability.id);
  const status = best >= 2 ? "available" : best >= 1 ? "partial" : "missing";
  const decision = status === "available" ? "research" : status === "partial" ? "adapt" : "adopt";
  const rationale = status === "available"
    ? "平台已有高度相关能力，需核对交互和规则差异后再决定。"
    : status === "partial" ? "平台已有相关基础能力，建议调整后吸收竞品设计思想。" : "平台未识别到相关能力，建议作为新增候选进入产品经理评审。";
  return { featureId: feature.id, featureName: feature.name, competitorModule: feature.module, scenario: feature.scenario, actors: [...feature.actors], operations: [...feature.operations], matchedCapabilityIds, status, decision, rationale, evidenceIds: [...feature.evidenceIds], requiresProductManagerReview: true };
}

export async function analyzeCompetitor(profilePath: string, baselinePath: string, outputDirectory: string): Promise<{ report: CompetitorAnalysisReport; jsonPath: string; markdownPath: string }> {
  const profileContent = await readFile(profilePath, "utf8"); const baselineContent = await readFile(baselinePath, "utf8");
  const profile = JSON.parse(profileContent) as CompetitorProfile;
  const baseline = JSON.parse(baselineContent) as PlatformCapabilityBaseline;
  assertProfile(profile); assertBaseline(baseline);
  const assessments = profile.features.map((feature) => assess(feature, baseline));
  const summary = { total: assessments.length, available: 0, partial: 0, missing: 0, "not-applicable": 0, adopt: 0, adapt: 0, reject: 0, research: 0 };
  for (const item of assessments) { summary[item.status] += 1; summary[item.decision] += 1; }
  const report: CompetitorAnalysisReport = { schemaVersion: "1.8", generatedAt: new Date().toISOString(), competitor: { id: profile.id, name: profile.name }, product: baseline.product, sourceHashes: { profile: hash(profileContent), baseline: hash(baselineContent) }, assessments, summary };
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, "competitor-analysis.json");
  const markdownPath = path.join(outputDirectory, "competitor-analysis.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderCompetitorAnalysis(report), "utf8")]);
  return { report, jsonPath, markdownPath };
}

async function readAnalysis(directory: string): Promise<CompetitorAnalysisReport> {
  const report = JSON.parse(await readFile(path.join(directory, "competitor-analysis.json"), "utf8")) as CompetitorAnalysisReport;
  if (report.schemaVersion !== "1.8" || !report.sourceHashes?.profile || !report.sourceHashes?.baseline || !Array.isArray(report.assessments)) throw new Error("竞品分析报告结构无效或已过期，请重新执行 competitor analyze。");
  return report;
}

export async function reviewCompetitorFeature(directory: string, featureId: string, decision: CompetitorDecision, scope: string, note = ""): Promise<{ review: CompetitorReview; path: string }> {
  const allowed: CompetitorDecision[] = ["adopt", "adapt", "reject", "research"];
  if (!allowed.includes(decision)) throw new Error(`竞品取舍必须是：${allowed.join("、")}`);
  if (!scope.trim()) throw new Error("竞品审核必须填写明确的适用范围。");
  const report = await readAnalysis(directory);
  if (!report.assessments.some((item) => item.featureId === featureId)) throw new Error(`竞品分析中不存在功能：${featureId}`);
  const reviewPath = path.join(directory, "competitor-review.json");
  let existing: CompetitorReview | undefined;
  try { existing = JSON.parse(await readFile(reviewPath, "utf8")) as CompetitorReview; } catch {}
  const analysisHash = hashReport(report);
  const decisions = existing?.analysisHash === analysisHash ? { ...existing.decisions } : {};
  decisions[featureId] = { featureId, decision, scope: scope.trim(), note: note.trim(), reviewedAt: new Date().toISOString() };
  const review: CompetitorReview = { schemaVersion: "1.8", status: Object.keys(decisions).length === report.assessments.length ? "reviewed" : "pending", analysisHash, decisions };
  await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  return { review, path: reviewPath };
}

export async function createRequirementFromCompetitor(directory: string, projectDirectory: string, featureId: string, requirementId: string, requirementName: string, productVersion?: string): Promise<{ requirementDirectory: string; inputPath: string }> {
  const report = await readAnalysis(directory);
  let review: CompetitorReview;
  try { review = JSON.parse(await readFile(path.join(directory, "competitor-review.json"), "utf8")) as CompetitorReview; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`竞品功能尚未完成产品经理审核：${featureId}`); throw error; }
  if (review.schemaVersion !== "1.8" || review.analysisHash !== hashReport(report)) throw new Error("竞品审核已失效，请基于最新分析重新审核。");
  const decision = review.decisions?.[featureId];
  if (!decision) throw new Error(`竞品功能尚未完成产品经理审核：${featureId}`);
  if (!(["adopt", "adapt"] as CompetitorDecision[]).includes(decision.decision)) throw new Error(`仅 adopt 或 adapt 的竞品功能可以创建需求，当前为 ${decision.decision}。`);
  const feature = report.assessments.find((item) => item.featureId === featureId);
  if (!feature) throw new Error(`竞品分析中不存在功能：${featureId}`);
  const project = JSON.parse(await readFile(path.join(projectDirectory, "project.json"), "utf8")) as { projectId?: string; projectName?: string; productVersion?: string };
  if (!project.projectId) throw new Error("目标项目缺少有效的 project.json。");
  const content = `# ${feature.featureName}平台功能需求\n\n## 需求来源\n\n- 竞品：${report.competitor.name}\n- 竞品功能：${feature.featureId}\n- 证据：${feature.evidenceIds.join("、")}\n- 产品经理决策：${decision.decision}\n- 适用范围：${decision.scope}\n\n## 业务场景\n\n${feature.scenario}\n\n## 使用角色\n\n${feature.actors.map((item) => `- ${item}`).join("\n")}\n\n## 核心操作\n\n${feature.operations.map((item) => `- ${item}`).join("\n")}\n\n## 平台化约束\n\n- 竞品仅作为设计证据，不直接复制页面或实现。\n- 必须结合基础平台现有能力与边界完成差异化设计。\n${decision.note ? `- 产品经理补充：${decision.note}\n` : ""}`;
  const prepared = await prepareRequirementOutput({ outputRoot: path.dirname(projectDirectory), projectId: project.projectId, projectName: project.projectName ?? project.projectId, productVersion: productVersion ?? project.productVersion ?? "0.1.0", requirementId, requirementName }, { sourcePath: `competitor/${report.competitor.id}/${feature.featureId}`, title: `${feature.featureName}平台功能需求`, content });
  const originDirectory = path.join(prepared.requirementDirectory, "00-sources", "competitor-origin"); await mkdir(originDirectory, { recursive: true });
  const inputPath = path.join(prepared.requirementDirectory, "00-requirement-input.md");
  await writeFile(path.join(originDirectory, "decision.json"), `${JSON.stringify({ schemaVersion: "1.8", analysisHash: review.analysisHash, competitor: report.competitor, product: report.product, feature, decision }, null, 2)}\n`, "utf8");
  return { requirementDirectory: prepared.requirementDirectory, inputPath };
}

const emptyPriorityReview = (): CompetitorPriorityReviewItem => ({ userValue: null, platformGenerality: null, businessUrgency: null, implementationComplexity: null, architectureFit: null, note: "" });

function validPriorityReview(item: CompetitorPriorityReviewItem): boolean {
  return [item.userValue, item.platformGenerality, item.businessUrgency, item.implementationComplexity, item.architectureFit].every((value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5);
}

export async function prioritizeCompetitorCandidates(directory: string): Promise<{ candidates: CompetitorCandidate[]; reviewPath: string; jsonPath: string; markdownPath: string }> {
  const report = await readAnalysis(directory);
  const review = JSON.parse(await readFile(path.join(directory, "competitor-review.json"), "utf8")) as CompetitorReview;
  if (review.analysisHash !== hashReport(report)) throw new Error("竞品审核已失效，不能进行优先级评估。");
  const eligible = report.assessments.filter((feature) => ["adopt", "adapt"].includes(review.decisions?.[feature.featureId]?.decision ?? ""));
  const reviewPath = path.join(directory, "competitor-priority-review.json");
  let saved: { schemaVersion?: string; analysisHash?: string; reviews?: Record<string, CompetitorPriorityReviewItem> } | undefined;
  try { saved = JSON.parse(await readFile(reviewPath, "utf8")); } catch {}
  const reviews: Record<string, CompetitorPriorityReviewItem> = {};
  for (const feature of eligible) reviews[feature.featureId] = saved?.analysisHash === review.analysisHash ? saved.reviews?.[feature.featureId] ?? emptyPriorityReview() : emptyPriorityReview();
  await writeFile(reviewPath, `${JSON.stringify({ schemaVersion: "1.8", analysisHash: review.analysisHash, reviews }, null, 2)}\n`, "utf8");
  const candidates = eligible.map((feature): CompetitorCandidate => {
    const decision = review.decisions[feature.featureId]!; const values = reviews[feature.featureId]!;
    const technicalSuggestionScore = feature.status === "missing" ? 75 : feature.status === "partial" ? 85 : 60;
    const candidate: CompetitorCandidate = { featureId: feature.featureId, featureName: feature.featureName, decision: decision.decision as "adopt" | "adapt", scope: decision.scope, technicalSuggestionScore, reviewStatus: validPriorityReview(values) ? "CONFIRMED" : "AWAITING_PM_REVIEW", productManagerReview: values };
    if (candidate.reviewStatus === "CONFIRMED") {
      candidate.finalPriorityScore = Math.round(((Number(values.userValue) + Number(values.platformGenerality) + Number(values.businessUrgency) + Number(values.architectureFit) + (6 - Number(values.implementationComplexity))) / 5) * 20);
      candidate.priorityBand = candidate.finalPriorityScore >= 85 ? "P0" : candidate.finalPriorityScore >= 70 ? "P1" : candidate.finalPriorityScore >= 50 ? "P2" : "P3";
    }
    return candidate;
  }).sort((a, b) => (b.finalPriorityScore ?? b.technicalSuggestionScore) - (a.finalPriorityScore ?? a.technicalSuggestionScore) || a.featureId.localeCompare(b.featureId));
  const jsonPath = path.join(directory, "competitor-priority-assessment.json"); const markdownPath = path.join(directory, "competitor-priority-assessment.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify({ schemaVersion: "1.8", analysisHash: review.analysisHash, candidates }, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderPriorityAssessment(candidates), "utf8")]);
  return { candidates, reviewPath, jsonPath, markdownPath };
}

function renderPriorityAssessment(candidates: CompetitorCandidate[]): string {
  const rows = candidates.map((item) => `| ${item.featureId} | ${item.featureName} | ${item.decision} | ${item.technicalSuggestionScore} | ${item.reviewStatus} | ${item.finalPriorityScore ?? "-"} | ${item.priorityBand ?? "-"} |`).join("\n");
  return `# 竞品候选功能优先级评估\n\n| 功能ID | 功能 | 取舍 | 技术建议分 | 产品经理复核 | 最终分数 | 优先级 |\n|---|---|---|---:|---|---:|---|\n${rows}\n\n> 技术建议分不包含业务判断。只有完整填写五项产品经理评分后，才生成最终分数和 P0–P3。\n`;
}

export async function buildCompetitorBacklog(directory: string, projectDirectory: string): Promise<{ backlog: CompetitorCandidateBacklog; jsonPath: string; markdownPath: string; portfolioPath?: string }> {
  const report = await readAnalysis(directory); const prioritized = await prioritizeCompetitorCandidates(directory);
  const linked = new Map<string, { requirementId: string; requirementDirectory: string }>();
  try {
    const entries = await readdir(path.join(projectDirectory, "requirements"), { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const requirementDirectory = path.join(projectDirectory, "requirements", entry.name);
      try {
        const origin = JSON.parse(await readFile(path.join(requirementDirectory, "00-sources/competitor-origin/decision.json"), "utf8")) as { feature?: { featureId?: string }; analysisHash?: string };
        const metadata = JSON.parse(await readFile(path.join(requirementDirectory, "requirement.json"), "utf8")) as { requirementId?: string };
        if (origin.analysisHash === hashReport(report) && origin.feature?.featureId && metadata.requirementId) linked.set(origin.feature.featureId, { requirementId: metadata.requirementId, requirementDirectory: path.relative(projectDirectory, requirementDirectory) });
      } catch {}
    }
  } catch {}
  let portfolio: Awaited<ReturnType<typeof buildRequirementPortfolio>> | undefined;
  if (linked.size) portfolio = await buildRequirementPortfolio(projectDirectory);
  const candidates = prioritized.candidates.map((candidate) => {
    const match = linked.get(candidate.featureId); const portfolioItem = match ? portfolio?.portfolio.requirements.find((item) => item.requirementId === match.requirementId) : undefined;
    return { ...candidate, ...(match ?? {}), portfolioAdmissionStatus: portfolioItem?.admissionStatus, syncStatus: match ? "LINKED" as const : "NOT_CREATED" as const };
  });
  const summary = { total: candidates.length, confirmed: candidates.filter((item) => item.reviewStatus === "CONFIRMED").length, awaitingReview: candidates.filter((item) => item.reviewStatus !== "CONFIRMED").length, linked: candidates.filter((item) => item.syncStatus === "LINKED").length, notCreated: candidates.filter((item) => item.syncStatus === "NOT_CREATED").length };
  const backlog: CompetitorCandidateBacklog = { schemaVersion: "1.8", generatedAt: new Date().toISOString(), competitor: report.competitor, analysisHash: hashReport(report), candidates, summary };
  const target = path.join(projectDirectory, "product", "portfolio"); await mkdir(target, { recursive: true });
  const jsonPath = path.join(target, "competitor-candidate-backlog.json"); const markdownPath = path.join(target, "competitor-candidate-backlog.md");
  const rows = candidates.map((item) => `| ${item.featureId} | ${item.featureName} | ${item.priorityBand ?? "-"} | ${item.syncStatus} | ${item.requirementId ?? "-"} | ${item.portfolioAdmissionStatus ?? "-"} |`).join("\n");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(backlog, null, 2)}\n`, "utf8"), writeFile(markdownPath, `# 竞品候选需求池\n\n| 竞品功能 | 功能名称 | 优先级 | 同步状态 | PAE需求 | 版本准入 |\n|---|---|---|---|---|---|\n${rows}\n`, "utf8")]);
  return { backlog, jsonPath, markdownPath, portfolioPath: portfolio?.jsonPath };
}

export function renderCompetitorAnalysis(report: CompetitorAnalysisReport): string {
  const rows = report.assessments.map((item) => `| ${item.featureId} | ${item.featureName} | ${item.competitorModule} | ${item.status} | ${item.matchedCapabilityIds.join("、") || "-"} | ${item.decision} | 待复核 |`).join("\n");
  return `# 竞品能力对标报告\n\n- 竞品：${report.competitor.name}\n- 对标产品：${report.product.name}\n- 功能数量：${report.summary.total}\n- 已具备 / 部分具备 / 未具备：${report.summary.available} / ${report.summary.partial} / ${report.summary.missing}\n\n| 功能ID | 功能 | 竞品模块 | 平台状态 | 匹配能力 | 建议 | 产品经理确认 |\n|---|---|---|---|---|---|---|\n${rows}\n\n> 分析结果只形成候选建议；证据、平台边界和最终取舍必须由产品经理确认，不能自动写入正式平台知识。\n`;
}
