import type { RuleKnowledge } from "./types.js";

export interface KnowledgeRule {
  id: string;
  name: string;
  description: string;
  severity: "error" | "warning";
}

export const B2B_RULES: KnowledgeRule[] = [
  {
    id: "rule.required-field",
    name: "必填字段",
    description: "关键业务字段必须声明 required，并提供明确标签。",
    severity: "error",
  },
  {
    id: "rule.destructive-confirmation",
    name: "危险操作确认",
    description: "撤回、删除等不可逆或高影响操作必须有确认机制。",
    severity: "warning",
  },
  {
    id: "rule.status-visible",
    name: "状态可见",
    description: "流程型业务的列表和详情必须展示当前状态。",
    severity: "error",
  },
];

export const KNOWLEDGE_RELATIONS = [
  "Business uses Pattern",
  "Pattern contains Component",
  "Component references Rule",
  "Rule constrains Component",
] as const;

export function toLegacyRule(rule: RuleKnowledge): KnowledgeRule {
  return { id: rule.id, name: rule.name, description: rule.description, severity: rule.severity };
}
