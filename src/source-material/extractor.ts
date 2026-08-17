import type { LlmProvider } from "../llm/types.js";
import { PLATFORM_KNOWLEDGE_KINDS } from "../platform-knowledge/types.js";
import type { PlatformKnowledgeKind } from "../platform-knowledge/types.js";
import type { ProductSourceExtraction } from "./types.js";

export interface ExtractedKnowledgeProposal {
  kind: PlatformKnowledgeKind;
  name: string;
  description: string;
  evidenceExcerpt: string;
  sectionId: string;
  confidence: "low" | "medium" | "high";
  domain?: string;
  module?: string;
  componentType?: string;
  severity?: "error" | "warning";
}

export interface MaterialKnowledgeExtractor {
  readonly id: string;
  readonly mode: "rule" | "llm";
  readonly model?: string;
  extract(input: ProductSourceExtraction): Promise<ExtractedKnowledgeProposal[]>;
}

const signals: Array<{ kind: PlatformKnowledgeKind; words: string[] }> = [
  { kind: "capability", words: ["管理", "支持", "能力", "功能", "维护"] },
  { kind: "pattern", words: ["页面", "列表", "树表", "流程", "布局", "模式"] },
  { kind: "component", words: ["组件", "表格", "表单", "选择器", "组织树", "弹窗", "抽屉"] },
  { kind: "constraint", words: ["必须", "不得", "唯一", "校验", "限制", "禁止", "前提"] },
];

function sentences(value: string): string[] {
  return value.split(/(?<=[。！？!?；;\n])/u).map((item) => item.trim()).filter((item) => item.length >= 6);
}

export class RuleBasedMaterialKnowledgeExtractor implements MaterialKnowledgeExtractor {
  readonly id = "pae-rule-material-extractor-1.5";
  readonly mode = "rule" as const;

  async extract(input: ProductSourceExtraction): Promise<ExtractedKnowledgeProposal[]> {
    const output: ExtractedKnowledgeProposal[] = [];
    for (const section of input.sections) for (const sentence of sentences(section.content)) {
      const match = signals.find((signal) => signal.words.some((word) => sentence.includes(word)));
      if (!match) continue;
      output.push({ kind: match.kind, name: sentence.replace(/^[\d.、（）()\s-]+/, "").slice(0, 28).replace(/[。；;，,：:]$/, "") || section.title,
        description: sentence, evidenceExcerpt: sentence, sectionId: section.id, confidence: sentence.length >= 12 ? "medium" : "low" });
    }
    return output;
  }
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

function validateProposals(value: unknown, input: ProductSourceExtraction): ExtractedKnowledgeProposal[] {
  const raw = value as { candidates?: unknown[] };
  if (!raw || !Array.isArray(raw.candidates)) throw new Error("LLM知识提取响应缺少 candidates 数组。");
  const sections = new Map(input.sections.map((item) => [item.id, item]));
  return raw.candidates.map((item, index) => {
    const candidate = item as Partial<ExtractedKnowledgeProposal>;
    if (!candidate.kind || !PLATFORM_KNOWLEDGE_KINDS.includes(candidate.kind)) throw new Error(`LLM候选 #${index + 1} kind 无效。`);
    if (!candidate.name?.trim() || !candidate.description?.trim()) throw new Error(`LLM候选 #${index + 1} 缺少名称或描述。`);
    const section = candidate.sectionId ? sections.get(candidate.sectionId) : undefined;
    if (!section) throw new Error(`LLM候选 #${index + 1} 引用了不存在的 sectionId。`);
    if (!candidate.evidenceExcerpt?.trim() || !section.content.includes(candidate.evidenceExcerpt.trim())) throw new Error(`LLM候选 #${index + 1} 的 evidenceExcerpt 不是来源原文。`);
    if (!candidate.confidence || !["low", "medium", "high"].includes(candidate.confidence)) throw new Error(`LLM候选 #${index + 1} confidence 无效。`);
    return { ...candidate, name: candidate.name.trim(), description: candidate.description.trim(), evidenceExcerpt: candidate.evidenceExcerpt.trim() } as ExtractedKnowledgeProposal;
  });
}

export class LlmMaterialKnowledgeExtractor implements MaterialKnowledgeExtractor {
  readonly id = "pae-llm-material-extractor-1.5";
  readonly mode = "llm" as const;
  readonly model: string;

  constructor(private readonly provider: LlmProvider, private readonly maxAttempts = 2) {
    this.model = provider.modelInfo().model;
  }

  async extract(input: ProductSourceExtraction): Promise<ExtractedKnowledgeProposal[]> {
    const source = input.sections.map((item) => `[${item.id}] ${item.title}\n${item.content}`).join("\n\n");
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.provider.generate({
          stage: "material-knowledge-derivation",
          systemPrompt: "你是PAE平台知识提取器。仅从输入原文提取 capability、pattern、component、constraint 或 case。返回严格JSON，不得补充原文没有的事实。每条evidenceExcerpt必须逐字来自指定sectionId。",
          userPrompt: `返回 {"candidates":[{"kind":"constraint","name":"名称","description":"结构化描述","evidenceExcerpt":"逐字原文","sectionId":"section-1","confidence":"high"}]}。没有候选时返回空数组。\n\n${source}`,
        });
        return validateProposals(parseJsonContent(response.content), input);
      } catch (error) { lastError = error; }
    }
    throw new Error(`LLM产品资料知识提取失败：${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
}
