import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformKnowledgeCatalog, PlatformKnowledgeEntity } from "../platform-knowledge/types.js";
import type { CandidateComparison, MaterialKnowledgeCandidate, MaterialKnowledgeComparisonReport, MaterialKnowledgeDerivation, MaterialReviewDecisionFile, ProductSourceExtraction } from "./types.js";
import type { ExtractedKnowledgeProposal, MaterialKnowledgeExtractor } from "./extractor.js";
import { RuleBasedMaterialKnowledgeExtractor } from "./extractor.js";

function slug(value: string): string { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ".").replace(/^\.|\.$/g, "").slice(0, 72) || "candidate"; }
function fingerprint(value: string): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }

function entityFor(proposal: ExtractedKnowledgeProposal, id: string, extraction: ProductSourceExtraction): PlatformKnowledgeEntity {
  const { kind, name, description } = proposal;
  const base = { id, kind, name, description, version: "0.1.0", status: "draft" as const, tags: [extraction.source.product, extraction.source.type],
    source: { type: "product-design" as const, document: extraction.source.name, section: name, version: extraction.source.version }, references: [] };
  if (kind === "capability") return { ...base, kind, domain: proposal.domain ?? "pending-classification", module: proposal.module ?? "pending-classification", level: "platform", supportedScenarios: [description], constraints: [] };
  if (kind === "pattern") return { ...base, kind, applicableScenarios: [description], nonApplicableScenarios: [], pageStructure: [], interactionRules: [] };
  if (kind === "component") return { ...base, kind, componentType: proposal.componentType ?? "pending-classification", usageRules: [description] };
  if (kind === "constraint") return { ...base, kind, severity: proposal.severity ?? (/必须|不得|禁止|唯一/.test(description) ? "error" : "warning"), rule: description };
  return { ...base, kind: "case", requirement: description, decision: "platform-extension", outcome: "待产品经理补充" };
}

export async function deriveMaterialKnowledge(extractionPath: string, outputDirectory?: string, options: { extractor?: MaterialKnowledgeExtractor } = {}): Promise<{ report: MaterialKnowledgeDerivation; jsonPath: string; markdownPath: string }> {
  const extraction = JSON.parse(await readFile(extractionPath, "utf8")) as ProductSourceExtraction;
  if (extraction.schemaVersion !== "1.5" || extraction.status !== "extracted") throw new Error("资料尚未完成可用解析，不能生成知识候选。");
  const candidates: MaterialKnowledgeCandidate[] = [];
  const seen = new Set<string>();
  const extractor: MaterialKnowledgeExtractor = options.extractor ?? new RuleBasedMaterialKnowledgeExtractor();
  const proposals = await extractor.extract(extraction);
  const sections = new Map(extraction.sections.map((item) => [item.id, item]));
  for (const proposal of proposals) {
      const section = sections.get(proposal.sectionId);
      if (!section) throw new Error(`知识候选引用了不存在的来源章节：${proposal.sectionId}`);
      const id = `${proposal.kind}.${slug(proposal.name)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({ id, kind: proposal.kind, status: "draft", confidence: proposal.confidence,
        entity: entityFor(proposal, id, extraction),
        evidence: { sourceId: extraction.source.id, sectionId: section.id, sectionTitle: section.title, locator: section.locator,
          excerpt: proposal.evidenceExcerpt.slice(0, 240), contentFingerprint: fingerprint(proposal.evidenceExcerpt) } });
  }
  const report: MaterialKnowledgeDerivation = { schemaVersion: "1.5", sourceId: extraction.source.id, status: "pending-product-manager-review", generatedAt: new Date().toISOString(),
    extractor: { id: extractor.id, mode: extractor.mode, model: extractor.model }, candidates };
  const directory = outputDirectory ?? path.join(path.dirname(extractionPath), "knowledge-candidates");
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "candidates.json");
  const markdownPath = path.join(directory, "candidates.md");
  const markdown = [`# 产品资料知识候选`, "", "> 候选不会自动进入正式平台知识目录，必须由产品经理复核。", "", `- 来源：${report.sourceId}`, `- 候选：${candidates.length}`, "",
    ...candidates.flatMap((item) => [`## ${item.id}`, "", `- 类型：${item.kind}`, `- 置信度：${item.confidence}`, `- 依据：${item.evidence.sectionTitle}`, "", item.evidence.excerpt, ""])].join("\n");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, `${markdown.trim()}\n`, "utf8")]);
  return { report, jsonPath, markdownPath };
}

export function compareMaterialCandidates(report: MaterialKnowledgeDerivation, catalog: PlatformKnowledgeCatalog): MaterialKnowledgeComparisonReport {
  const normalized = (value: string) => value.replace(/[\s，。；;,.]/g, "");
  const versionParts = (value?: string) => (value ?? "0.0.0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const newer = (candidate?: string, existing?: string) => {
    const left = versionParts(candidate); const right = versionParts(existing);
    return left.some((value, index) => value > (right[index] ?? 0) && left.slice(0, index).every((part, previous) => part === (right[previous] ?? 0)));
  };
  const contradiction = (left: string, right: string) => [
    ["支持", "不支持"], ["允许", "不得"], ["必须", "可选"], ["展示", "不得展示"], ["唯一", "可重复"], ["不可重复", "允许重复"],
  ].some(([positive, negative]) => (left.includes(positive) && right.includes(negative)) || (left.includes(negative) && right.includes(positive)));
  const compareExisting = (candidate: MaterialKnowledgeCandidate, existing: PlatformKnowledgeEntity): CandidateComparison => {
    if (normalized(existing.description) === normalized(candidate.entity.description)) return { candidateId: candidate.id, existingId: existing.id, decision: "duplicate", reasons: ["描述与现有知识一致，仅需考虑补充来源"], requiresHumanConfirmation: true };
    if (contradiction(candidate.entity.description, existing.description)) return { candidateId: candidate.id, existingId: existing.id, decision: "conflict", reasons: ["候选与现有知识包含相反约束或能力陈述"], requiresHumanConfirmation: true };
    if (newer(candidate.entity.source.version, existing.source.version)) return { candidateId: candidate.id, existingId: existing.id, decision: "new-version", reasons: [`资料版本 ${candidate.entity.source.version} 高于现有来源版本 ${existing.source.version ?? "未标注"}`], requiresHumanConfirmation: true };
    return { candidateId: candidate.id, existingId: existing.id, decision: "supplement", reasons: ["同一知识的描述不同，可能是来源补充或规则扩展"], requiresHumanConfirmation: true };
  };
  const comparisons: CandidateComparison[] = report.candidates.map((candidate) => {
    const exact = catalog.byId.get(candidate.id);
    if (exact) return compareExisting(candidate, exact);
    const sameName = catalog.entities.find((item) => item.kind === candidate.kind && item.name === candidate.entity.name);
    if (sameName) return { ...compareExisting(candidate, sameName), reasons: ["同类型知识名称相同但ID不同", ...compareExisting(candidate, sameName).reasons] };
    const conflicting = catalog.entities.find((item) => item.kind === candidate.kind && candidate.entity.description.includes(item.name));
    if (conflicting) return { candidateId: candidate.id, existingId: conflicting.id, decision: "needs-review", reasons: ["候选描述涉及现有知识，需要人工判断关系"], requiresHumanConfirmation: true };
    return { candidateId: candidate.id, decision: "new-knowledge", reasons: ["未找到相同ID或同名知识"], requiresHumanConfirmation: true };
  });
  return { schemaVersion: "1.5", sourceId: report.sourceId, catalogVersion: catalog.version, comparedAt: new Date().toISOString(), comparisons };
}

export async function writeMaterialComparison(report: MaterialKnowledgeComparisonReport, directory: string): Promise<{ jsonPath: string; markdownPath: string; reviewPath: string }> {
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "comparison.json");
  const markdownPath = path.join(directory, "comparison.md");
  const reviewPath = path.join(directory, "review-decision.json");
  const markdown = [`# 知识候选比较`, "", `- 来源：${report.sourceId}`, `- 正式知识目录版本：${report.catalogVersion}`, "", "| 候选 | 已有知识 | 判断 | 原因 |", "|---|---|---|---|",
    ...report.comparisons.map((item) => `| ${item.candidateId} | ${item.existingId ?? "—"} | ${item.decision} | ${item.reasons.join("；")} |`), "", "> 所有判断均需要产品经理确认，不会自动覆盖正式知识。"].join("\n");
  const review: MaterialReviewDecisionFile = { schemaVersion: "1.5", sourceId: report.sourceId, catalogVersion: report.catalogVersion, reviewedBy: "product-manager",
    decisions: report.comparisons.map((item) => ({ candidateId: item.candidateId, action: "pending", note: `比较建议：${item.decision}` })) };
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, `${markdown}\n`, "utf8"), writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`, "utf8")]);
  return { jsonPath, markdownPath, reviewPath };
}
