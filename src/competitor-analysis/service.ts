import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CompetitorAnalysisReport, CompetitorFeature, CompetitorFeatureAssessment, CompetitorProfile, PlatformCapabilityBaseline } from "./types.js";

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
  return { featureId: feature.id, featureName: feature.name, competitorModule: feature.module, matchedCapabilityIds, status, decision, rationale, evidenceIds: [...feature.evidenceIds], requiresProductManagerReview: true };
}

export async function analyzeCompetitor(profilePath: string, baselinePath: string, outputDirectory: string): Promise<{ report: CompetitorAnalysisReport; jsonPath: string; markdownPath: string }> {
  const profile = JSON.parse(await readFile(profilePath, "utf8")) as CompetitorProfile;
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as PlatformCapabilityBaseline;
  assertProfile(profile); assertBaseline(baseline);
  const assessments = profile.features.map((feature) => assess(feature, baseline));
  const summary = { total: assessments.length, available: 0, partial: 0, missing: 0, "not-applicable": 0, adopt: 0, adapt: 0, reject: 0, research: 0 };
  for (const item of assessments) { summary[item.status] += 1; summary[item.decision] += 1; }
  const report: CompetitorAnalysisReport = { schemaVersion: "1.8", generatedAt: new Date().toISOString(), competitor: { id: profile.id, name: profile.name }, product: baseline.product, assessments, summary };
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, "competitor-analysis.json");
  const markdownPath = path.join(outputDirectory, "competitor-analysis.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderCompetitorAnalysis(report), "utf8")]);
  return { report, jsonPath, markdownPath };
}

export function renderCompetitorAnalysis(report: CompetitorAnalysisReport): string {
  const rows = report.assessments.map((item) => `| ${item.featureId} | ${item.featureName} | ${item.competitorModule} | ${item.status} | ${item.matchedCapabilityIds.join("、") || "-"} | ${item.decision} | 待复核 |`).join("\n");
  return `# 竞品能力对标报告\n\n- 竞品：${report.competitor.name}\n- 对标产品：${report.product.name}\n- 功能数量：${report.summary.total}\n- 已具备 / 部分具备 / 未具备：${report.summary.available} / ${report.summary.partial} / ${report.summary.missing}\n\n| 功能ID | 功能 | 竞品模块 | 平台状态 | 匹配能力 | 建议 | 产品经理确认 |\n|---|---|---|---|---|---|---|\n${rows}\n\n> 分析结果只形成候选建议；证据、平台边界和最终取舍必须由产品经理确认，不能自动写入正式平台知识。\n`;
}
