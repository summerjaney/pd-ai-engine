import { createHash } from "node:crypto";
import type { RequirementInput } from "../domain/types.js";
import type { ComposedExtensionContext, ExtensionResource } from "../extensions/types.js";
import { PLATFORM_ANALYSIS_SCHEMA_VERSION, type PlatformAnalysisReport, type PlatformBoundaryPath, type PlatformCapabilityMatch } from "./types.js";
import type { PlatformKnowledgeCatalog } from "../platform-knowledge/types.js";
import { assessCapabilityGap } from "../platform-knowledge/assessment.js";

function terms(value: string): Set<string> {
  const normalized = value.toLowerCase();
  const result = new Set(normalized.match(/[a-z0-9][a-z0-9_-]+|[\p{Script=Han}]{2,}/gu) ?? []);
  for (const chunk of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let size = 2; size <= Math.min(4, chunk.length); size++) {
      for (let index = 0; index <= chunk.length - size; index++) result.add(chunk.slice(index, index + size));
    }
  }
  return result;
}

function score(query: Set<string>, ...values: string[]): number {
  const candidate = terms(values.join(" "));
  let result = 0;
  for (const term of candidate) if (query.has(term)) result += term.length >= 4 ? 2 : 1;
  return result;
}

function objectValue(resource: ExtensionResource): Record<string, unknown> | undefined {
  return resource.value && typeof resource.value === "object" && !Array.isArray(resource.value) ? resource.value as Record<string, unknown> : undefined;
}

function selectCapabilities(context: ComposedExtensionContext, query: Set<string>): PlatformCapabilityMatch[] {
  const selected: PlatformCapabilityMatch[] = [];
  for (const resource of context.resources) {
    const value = objectValue(resource);
    const staticCapabilities = Array.isArray(value?.capabilities) ? value.capabilities : [];
    const acceptedCapabilities = Array.isArray(value?.entries)
      ? value.entries.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "capability" && (item as Record<string, unknown>).status === "accepted")
      : [];
    for (const item of [...staticCapabilities, ...acceptedCapabilities]) {
      if (!item || typeof item !== "object") continue;
      const capability = item as Record<string, unknown>;
      if (typeof capability.id !== "string" || typeof capability.name !== "string") continue;
      const relevance = score(query, capability.id, capability.name, typeof capability.module === "string" ? capability.module : "", typeof capability.summary === "string" ? capability.summary : "");
      if (relevance > 0) selected.push({ id: capability.id, name: capability.name, module: typeof capability.module === "string" ? capability.module : undefined, status: typeof capability.status === "string" ? capability.status : undefined, score: relevance, source: resource.source });
    }
  }
  return selected.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function selectModules(context: ComposedExtensionContext, query: Set<string>, capabilities: PlatformCapabilityMatch[]): string[] {
  const selected = new Set(capabilities.map((item) => item.module).filter((item): item is string => Boolean(item)));
  for (const resource of context.resources) {
    const value = objectValue(resource);
    if (!Array.isArray(value?.modules)) continue;
    for (const module of value.modules) if (typeof module === "string" && score(query, module) > 0) selected.add(module);
  }
  return [...selected].sort((left, right) => left.localeCompare(right));
}

function selectRules(context: ComposedExtensionContext, query: Set<string>) {
  return context.resources.filter((resource) => resource.source.resourceType === "rules").map((resource) => {
    const value = objectValue(resource);
    const id = resource.id ?? resource.source.path;
    const name = typeof value?.name === "string" ? value.name : id;
    return { id, name, relevance: score(query, id, name, JSON.stringify(value ?? "")), source: resource.source };
  }).filter((item) => item.relevance > 0 || item.id === "lowcode.platform-boundary").sort((left, right) => right.relevance - left.relevance || left.id.localeCompare(right.id)).map(({ relevance: _relevance, ...item }) => item);
}

function assessBoundary(capabilities: PlatformCapabilityMatch[], content: string): { recommendation: PlatformBoundaryPath; confidence: "low" | "medium"; basis: string[]; alternatives: PlatformBoundaryPath[] } {
  const architectureSignals = /底层模型|底层架构|架构改造|历史数据迁移|模型迁移|向后兼容|版本兼容|版本回滚|发布机制|发布架构/.test(content);
  if (architectureSignals) return { recommendation: "architecture-assessment", confidence: "medium", basis: ["需求包含底层模型、兼容、版本或发布相关信号。", "必须评估历史配置和数据影响。"], alternatives: ["platform-enhancement", "project-validation"] };
  if (capabilities.length > 0) return { recommendation: "platform-enhancement", confidence: "medium", basis: [`匹配到 ${capabilities.length} 项现有平台能力。`, "应先确认现有配置能否覆盖，再判断是否需要增强。"], alternatives: ["configuration", "project-validation"] };
  return { recommendation: "project-validation", confidence: "low", basis: ["当前能力地图未匹配到可确认的已有能力。", "资料不足时不能直接判定为平台通用能力或项目定制。"], alternatives: ["platform-capability", "project-customization"] };
}

export function analyzePlatformRequirement(input: RequirementInput, context: ComposedExtensionContext, platformKnowledge?: PlatformKnowledgeCatalog): PlatformAnalysisReport {
  const query = terms(`${input.title}\n${input.content}`);
  const matchedCapabilities = selectCapabilities(context, query);
  const affectedModules = selectModules(context, query, matchedCapabilities);
  const applicableRules = selectRules(context, query);
  const assessment = assessBoundary(matchedCapabilities, input.content);
  const unknowns = ["现有功能的实际配置范围是否完整覆盖需求", "该需求是否已在多个项目重复出现", "技术实现、历史数据和兼容性约束", "最终平台化边界及版本范围"];
  const capabilityGap = platformKnowledge ? assessCapabilityGap(input, platformKnowledge) : undefined;
  const knowledgeRecommendation = capabilityGap?.boundary.recommendation;
  const effectiveAssessment = assessment.recommendation !== "architecture-assessment" && knowledgeRecommendation && knowledgeRecommendation !== "project-validation"
    ? { recommendation: knowledgeRecommendation as PlatformBoundaryPath, confidence: capabilityGap.boundary.confidence === "low" ? "low" as const : "medium" as const, basis: [...assessment.basis, ...capabilityGap.boundary.basis], alternatives: assessment.alternatives }
    : assessment;
  return {
    schemaVersion: PLATFORM_ANALYSIS_SCHEMA_VERSION,
    requirement: { title: input.title, fingerprint: createHash("sha256").update(input.content).digest("hex") },
    context: { extensions: context.extensions.map((item) => ({ id: item.id, version: item.version })) },
    currentState: { affectedModules, matchedCapabilities, applicableRules },
    gap: {
      summary: matchedCapabilities.length ? "需求与现有平台能力存在关联，需要进一步确认配置覆盖范围和待增强缺口。" : "当前知识中未找到足够的现有能力证据，需要补充平台资料后再确定差异。",
      existingCapabilityCount: matchedCapabilities.length,
      unknowns,
    },
    boundaryAssessment: { ...effectiveAssessment, status: "pending-human-confirmation", requiresHumanConfirmation: true },
    capabilityGap,
  };
}

export function renderPlatformAnalysisReport(report: PlatformAnalysisReport): string {
  const capabilities = report.currentState.matchedCapabilities.length ? report.currentState.matchedCapabilities.map((item) => `| ${item.name} | ${item.module ?? "-"} | ${item.status ?? "unknown"} | ${item.score} | ${item.source.extensionId}/${item.source.path} |`).join("\n") : "| 未匹配到已有能力 | - | unknown | 0 | - |";
  const rules = report.currentState.applicableRules.length ? report.currentState.applicableRules.map((item) => `- ${item.name}（${item.source.extensionId}/${item.source.path}）`).join("\n") : "- 暂无匹配规则";
  return `# 低代码平台前置分析\n\n- 需求：${report.requirement.title}\n- 涉及模块：${report.currentState.affectedModules.join("、") || "待识别"}\n- 判断状态：待产品经理确认\n\n## 平台现状与已有能力\n\n| 能力 | 模块 | 状态 | 相关度 | 来源 |\n|---|---|---|---:|---|\n${capabilities}\n\n## 适用规则\n\n${rules}\n\n## 现状与目标差异\n\n${report.gap.summary}\n\n待补充：\n${report.gap.unknowns.map((item) => `- ${item}`).join("\n")}\n\n## 平台化判断建议\n\n- 建议路径：${report.boundaryAssessment.recommendation}\n- 置信度：${report.boundaryAssessment.confidence}\n- 状态：${report.boundaryAssessment.status}\n- 备选路径：${report.boundaryAssessment.alternatives.join("、")}\n\n判断依据：\n${report.boundaryAssessment.basis.map((item) => `- ${item}`).join("\n")}\n\n> 本报告只提供基于现有资料的分析建议，不能替代产品经理对平台边界、版本范围和兼容策略的最终确认。\n`;
}
