import type { PrototypeDsl, StageId } from "../domain/types.js";
import type { CapabilityGapAssessment, PlatformKnowledgeKind } from "./types.js";

export const PLATFORM_KNOWLEDGE_TRACE_VERSION = "1.4" as const;

export interface PlatformKnowledgeUsageItem {
  id: string;
  kind: PlatformKnowledgeKind;
  version: string;
  name: string;
  sourceDocument: string;
}

export interface PlatformKnowledgeUsagePlan {
  schemaVersion: typeof PLATFORM_KNOWLEDGE_TRACE_VERSION;
  catalogVersion: string;
  requirementFingerprint: string;
  stages: Partial<Record<StageId, PlatformKnowledgeUsageItem[]>>;
}

const STAGE_KINDS: Partial<Record<StageId, PlatformKnowledgeKind[]>> = {
  "requirement-analysis": ["capability", "constraint"],
  "product-outline": ["capability", "pattern"],
  "product-architecture": ["capability", "pattern"],
  "core-flow": ["capability", "constraint"],
  "page-structure": ["pattern", "component", "constraint"],
  prototype: ["capability", "pattern", "component", "constraint"],
  prd: ["capability", "pattern", "component", "constraint"],
  review: ["capability", "pattern", "component", "constraint"],
};

export function buildPlatformKnowledgeUsagePlan(assessment: CapabilityGapAssessment): PlatformKnowledgeUsagePlan {
  const matched = new Map(assessment.matched.map((item) => [item.id, item]));
  const reuseIds = new Set([
    ...assessment.reuse.capabilities,
    ...assessment.reuse.patterns,
    ...assessment.reuse.components,
    ...assessment.reuse.constraints,
  ]);
  const items = [...reuseIds].map((id) => matched.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item): PlatformKnowledgeUsageItem => ({ id: item.id, kind: item.kind, version: item.version, name: item.name, sourceDocument: item.source.document }));
  const stages: PlatformKnowledgeUsagePlan["stages"] = {};
  for (const [stage, kinds] of Object.entries(STAGE_KINDS) as Array<[StageId, PlatformKnowledgeKind[]]>) {
    stages[stage] = items.filter((item) => kinds.includes(item.kind));
  }
  return { schemaVersion: "1.4", catalogVersion: assessment.platformKnowledge.catalogVersion, requirementFingerprint: assessment.requirement.fingerprint, stages };
}

function marker(item: PlatformKnowledgeUsageItem): string {
  return `[platform-knowledge:${item.id}@${item.version}]`;
}

export function applyPlatformKnowledgeUsage(stage: StageId, artifact: string | PrototypeDsl, plan?: PlatformKnowledgeUsagePlan): string | PrototypeDsl {
  const items = plan?.stages[stage] ?? [];
  if (!items.length) return artifact;
  if (typeof artifact === "string") {
    if (artifact.includes("## 平台知识引用")) return artifact;
    const rows = items.map((item) => `| ${marker(item)} | ${item.kind} | ${item.name} | ${item.sourceDocument} |`).join("\n");
    return `${artifact.trim()}\n\n## 平台知识引用\n\n| 知识标识 | 类型 | 名称 | 来源 |\n|---|---|---|---|\n${rows}\n`;
  }
  if (stage !== "prototype") return artifact;
  const copy = structuredClone(artifact);
  const markers = items.map(marker).join("；");
  copy.product.sourceAttribution = [copy.product.sourceAttribution, `平台知识：${markers}`].filter(Boolean).join("；");
  for (const item of items.filter((candidate) => candidate.kind === "constraint")) {
    if (!copy.rules.some((rule) => rule.id === item.id)) copy.rules.push({ id: item.id, description: `${item.name}（${marker(item)}）`, appliesTo: copy.pages.map((page) => page.id) });
  }
  return copy;
}

export function renderPlatformKnowledgeUsagePlan(plan: PlatformKnowledgeUsagePlan): string {
  const sections = Object.entries(plan.stages).filter(([, items]) => items?.length).map(([stage, items]) => `## ${stage}\n\n${items!.map((item) => `- ${marker(item)} ${item.name}｜${item.sourceDocument}`).join("\n")}`);
  return `# 平台知识使用计划\n\n- 知识版本：${plan.catalogVersion}\n- 需求指纹：${plan.requirementFingerprint}\n\n${sections.join("\n\n")}\n`;
}
