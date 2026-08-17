import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformKnowledgeCatalog, PlatformKnowledgeEntity, PlatformKnowledgeKind } from "../platform-knowledge/types.js";
import type { CandidateComparison, MaterialKnowledgeCandidate, MaterialKnowledgeComparisonReport, MaterialKnowledgeDerivation, ProductSourceExtraction } from "./types.js";

const signals: Array<{ kind: PlatformKnowledgeKind; words: string[] }> = [
  { kind: "capability", words: ["管理", "支持", "能力", "功能", "维护"] },
  { kind: "pattern", words: ["页面", "列表", "树表", "流程", "布局", "模式"] },
  { kind: "component", words: ["组件", "表格", "表单", "选择器", "组织树", "弹窗", "抽屉"] },
  { kind: "constraint", words: ["必须", "不得", "唯一", "校验", "限制", "禁止", "前提"] },
];

function slug(value: string): string { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ".").replace(/^\.|\.$/g, "").slice(0, 72) || "candidate"; }
function fingerprint(value: string): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function sentences(value: string): string[] { return value.split(/(?<=[。！？!?；;\n])/u).map((item) => item.trim()).filter((item) => item.length >= 6); }

function entityFor(kind: PlatformKnowledgeKind, id: string, name: string, description: string, extraction: ProductSourceExtraction): PlatformKnowledgeEntity {
  const base = { id, kind, name, description, version: "0.1.0", status: "draft" as const, tags: [extraction.source.product, extraction.source.type],
    source: { type: "product-design" as const, document: extraction.source.name, section: name, version: extraction.source.version }, references: [] };
  if (kind === "capability") return { ...base, kind, domain: "pending-classification", module: "pending-classification", level: "platform", supportedScenarios: [description], constraints: [] };
  if (kind === "pattern") return { ...base, kind, applicableScenarios: [description], nonApplicableScenarios: [], pageStructure: [], interactionRules: [] };
  if (kind === "component") return { ...base, kind, componentType: "pending-classification", usageRules: [description] };
  if (kind === "constraint") return { ...base, kind, severity: /必须|不得|禁止|唯一/.test(description) ? "error" : "warning", rule: description };
  return { ...base, kind: "case", requirement: description, decision: "platform-extension", outcome: "待产品经理补充" };
}

export async function deriveMaterialKnowledge(extractionPath: string, outputDirectory?: string): Promise<{ report: MaterialKnowledgeDerivation; jsonPath: string; markdownPath: string }> {
  const extraction = JSON.parse(await readFile(extractionPath, "utf8")) as ProductSourceExtraction;
  if (extraction.schemaVersion !== "1.5" || extraction.status !== "extracted") throw new Error("资料尚未完成可用解析，不能生成知识候选。");
  const candidates: MaterialKnowledgeCandidate[] = [];
  const seen = new Set<string>();
  for (const section of extraction.sections) {
    for (const sentence of sentences(section.content)) {
      const match = signals.find((signal) => signal.words.some((word) => sentence.includes(word)));
      if (!match) continue;
      const name = sentence.replace(/^[\d.、（）()\s-]+/, "").slice(0, 28).replace(/[。；;，,：:]$/, "") || section.title;
      const id = `${match.kind}.${slug(name)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({ id, kind: match.kind, status: "draft", confidence: sentence.length >= 12 ? "medium" : "low",
        entity: entityFor(match.kind, id, name, sentence, extraction),
        evidence: { sourceId: extraction.source.id, sectionId: section.id, sectionTitle: section.title, locator: section.locator,
          excerpt: sentence.slice(0, 240), contentFingerprint: fingerprint(sentence) } });
    }
  }
  const report: MaterialKnowledgeDerivation = { schemaVersion: "1.5", sourceId: extraction.source.id, status: "pending-product-manager-review", generatedAt: new Date().toISOString(), candidates };
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
  const comparisons: CandidateComparison[] = report.candidates.map((candidate) => {
    const exact = catalog.byId.get(candidate.id);
    if (exact) {
      const same = exact.description.replace(/\s/g, "") === candidate.entity.description.replace(/\s/g, "");
      return { candidateId: candidate.id, existingId: exact.id, decision: same ? "duplicate" : "supplement", reasons: [same ? "ID与描述均与现有知识一致" : "ID一致但描述不同，需要确认是补充还是版本变化"], requiresHumanConfirmation: true };
    }
    const sameName = catalog.entities.find((item) => item.kind === candidate.kind && item.name === candidate.entity.name);
    if (sameName) return { candidateId: candidate.id, existingId: sameName.id, decision: "needs-review", reasons: ["同类型知识名称相同但ID不同"], requiresHumanConfirmation: true };
    const conflicting = catalog.entities.find((item) => item.kind === candidate.kind && candidate.entity.description.includes(item.name));
    if (conflicting) return { candidateId: candidate.id, existingId: conflicting.id, decision: "needs-review", reasons: ["候选描述涉及现有知识，需要人工判断关系"], requiresHumanConfirmation: true };
    return { candidateId: candidate.id, decision: "new-knowledge", reasons: ["未找到相同ID或同名知识"], requiresHumanConfirmation: true };
  });
  return { schemaVersion: "1.5", sourceId: report.sourceId, catalogVersion: catalog.version, comparedAt: new Date().toISOString(), comparisons };
}

export async function writeMaterialComparison(report: MaterialKnowledgeComparisonReport, directory: string): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "comparison.json");
  const markdownPath = path.join(directory, "comparison.md");
  const markdown = [`# 知识候选比较`, "", `- 来源：${report.sourceId}`, `- 正式知识目录版本：${report.catalogVersion}`, "", "| 候选 | 已有知识 | 判断 | 原因 |", "|---|---|---|---|",
    ...report.comparisons.map((item) => `| ${item.candidateId} | ${item.existingId ?? "—"} | ${item.decision} | ${item.reasons.join("；")} |`), "", "> 所有判断均需要产品经理确认，不会自动覆盖正式知识。"].join("\n");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, `${markdown}\n`, "utf8")]);
  return { jsonPath, markdownPath };
}
