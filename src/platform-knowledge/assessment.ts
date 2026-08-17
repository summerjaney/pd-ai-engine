import { createHash } from "node:crypto";
import type { RequirementInput } from "../domain/types.js";
import type { CapabilityGapAssessment, PlatformKnowledgeCatalog, PlatformKnowledgeEntity, PlatformKnowledgeMatch } from "./types.js";

function terms(value: string): Set<string> {
  const normalized = value.toLowerCase();
  const result = new Set(normalized.match(/[a-z0-9][a-z0-9_-]+|[\p{Script=Han}]{2,}/gu) ?? []);
  for (const chunk of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let size = 2; size <= Math.min(5, chunk.length); size++) {
      for (let index = 0; index <= chunk.length - size; index++) result.add(chunk.slice(index, index + size));
    }
  }
  return result;
}

function searchableText(entity: PlatformKnowledgeEntity): string {
  const specific = entity.kind === "capability"
    ? [entity.domain, entity.module, ...entity.supportedScenarios]
    : entity.kind === "pattern"
      ? [...entity.applicableScenarios, ...entity.pageStructure, ...entity.interactionRules]
      : entity.kind === "component"
        ? [entity.componentType, ...entity.usageRules]
        : entity.kind === "constraint"
          ? [entity.rule]
          : [entity.requirement, entity.outcome];
  return [entity.id, entity.name, entity.description, ...entity.tags, ...specific].join(" ");
}

function relevance(query: Set<string>, entity: PlatformKnowledgeEntity): number {
  const candidate = terms(searchableText(entity));
  let score = 0;
  for (const term of candidate) if (query.has(term)) score += term.length >= 4 ? 3 : 1;
  return score;
}

function relatedEntities(catalog: PlatformKnowledgeCatalog, matches: PlatformKnowledgeMatch[]): PlatformKnowledgeEntity[] {
  const result = new Map<string, PlatformKnowledgeEntity>();
  const visit = (id: string): void => {
    const entity = catalog.byId.get(id);
    if (!entity || result.has(id) || entity.status !== "confirmed") return;
    result.set(id, entity);
    entity.references.forEach((reference) => visit(reference.id));
  };
  matches.forEach((match) => visit(match.id));
  return [...result.values()];
}

function detectGaps(content: string, reused: PlatformKnowledgeEntity[]): CapabilityGapAssessment["gaps"] {
  const known = terms(reused.map(searchableText).join(" "));
  const candidates = [
    { id: "effective-date", pattern: /有效期|生效时间|失效时间|定时生效|定时失效/, label: "有效期及定时生效控制" },
    { id: "history-version", pattern: /历史版本|版本查询|变更历史|历史记录/, label: "历史版本与变更追溯" },
    { id: "owner", pattern: /负责人|责任人/, label: "组织负责人维护" },
    { id: "reference-validation", pattern: /引用校验|业务引用|被引用/, label: "业务引用及停用校验" },
  ];
  return candidates.filter((candidate) => candidate.pattern.test(content) && ![...terms(candidate.label)].some((term) => known.has(term)))
    .map((candidate) => ({ id: `gap.${candidate.id}`, description: candidate.label, evidence: `需求文本包含“${content.match(candidate.pattern)?.[0] ?? candidate.label}”，已确认知识中未找到对应能力。`, status: "needs-confirmation" }));
}

export function assessCapabilityGap(input: RequirementInput, catalog: PlatformKnowledgeCatalog): CapabilityGapAssessment {
  const query = terms(`${input.title}\n${input.content}`);
  const matched = catalog.entities
    .filter((entity) => entity.status === "confirmed")
    .map((entity) => ({ entity, score: relevance(query, entity) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entity.id.localeCompare(right.entity.id))
    .map(({ entity, score }): PlatformKnowledgeMatch => ({ id: entity.id, kind: entity.kind, name: entity.name, score, version: entity.version, source: entity.source }));
  const directlyMatchedCapabilities = matched.filter((item) => item.kind === "capability");
  const reused = relatedEntities(catalog, directlyMatchedCapabilities.length ? directlyMatchedCapabilities : matched);
  const gaps = detectGaps(input.content, reused);
  const architectureSignal = /底层模型|架构改造|历史数据迁移|向后兼容/.test(input.content);
  const recommendation = directlyMatchedCapabilities.length
    ? gaps.length ? "platform-enhancement" : "configuration"
    : /仅本项目|项目专用|客户定制/.test(input.content) ? "project-customization" : "project-validation";
  const basis = directlyMatchedCapabilities.length
    ? [`匹配到 ${directlyMatchedCapabilities.length} 项已确认平台能力。`, gaps.length ? `识别到 ${gaps.length} 项待确认能力缺口。` : "需求暂未超出已确认能力范围。"]
    : ["未匹配到已确认的平台能力，不能直接判断为平台通用能力。"];
  if (architectureSignal) basis.push("需求包含底层模型、迁移或兼容性信号，需要补充架构影响评估。");
  const ids = (kind: PlatformKnowledgeEntity["kind"]) => reused.filter((item) => item.kind === kind).map((item) => item.id);
  return {
    schemaVersion: "1.4",
    requirement: { title: input.title, fingerprint: createHash("sha256").update(input.content).digest("hex") },
    platformKnowledge: { productId: catalog.product.id, productVersion: catalog.product.version, catalogVersion: catalog.version },
    matched,
    reuse: { capabilities: ids("capability"), patterns: ids("pattern"), components: ids("component"), constraints: ids("constraint") },
    gaps,
    boundary: { recommendation, confidence: directlyMatchedCapabilities.length ? gaps.length ? "medium" : "high" : "low", basis, requiresHumanConfirmation: true },
  };
}

export function renderCapabilityGapAssessment(report: CapabilityGapAssessment): string {
  const matches = report.matched.length ? report.matched.map((item) => `| ${item.name} | ${item.kind} | ${item.score} | ${item.source.document} |`).join("\n") : "| 未匹配 | - | 0 | - |";
  const gaps = report.gaps.length ? report.gaps.map((item) => `- **${item.description}**：${item.evidence}`).join("\n") : "- 未识别到超出已确认知识的显式缺口。";
  return `# 平台能力差距分析\n\n- 需求：${report.requirement.title}\n- 平台：${report.platformKnowledge.productId} ${report.platformKnowledge.productVersion}\n- 知识版本：${report.platformKnowledge.catalogVersion}\n\n## 知识匹配\n\n| 名称 | 类型 | 相关度 | 来源 |\n|---|---|---:|---|\n${matches}\n\n## 可复用资产\n\n- 平台能力：${report.reuse.capabilities.join("、") || "无"}\n- 页面模式：${report.reuse.patterns.join("、") || "无"}\n- 组件：${report.reuse.components.join("、") || "无"}\n- 约束：${report.reuse.constraints.join("、") || "无"}\n\n## 能力缺口\n\n${gaps}\n\n## 边界判断建议\n\n- 建议：${report.boundary.recommendation}\n- 置信度：${report.boundary.confidence}\n- 必须人工确认：是\n\n${report.boundary.basis.map((item) => `- ${item}`).join("\n")}\n`;
}
