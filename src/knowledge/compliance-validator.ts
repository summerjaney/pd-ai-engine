import type { PrototypeDsl } from "../domain/types.js";
import type { KnowledgeCatalog, KnowledgeSelectionResult, RuleKnowledge } from "./types.js";

export interface KnowledgeComplianceItem {
  knowledgeId: string;
  version: string;
  name: string;
  severity: RuleKnowledge["severity"];
  status: "passed" | "failed" | "manual";
  message: string;
}

export interface KnowledgeComplianceResult {
  valid: boolean;
  items: KnowledgeComplianceItem[];
}

export class KnowledgeComplianceValidator {
  validatePrototype(prototype: PrototypeDsl, catalog: KnowledgeCatalog, selection: KnowledgeSelectionResult): KnowledgeComplianceResult {
    const rules = selection.selectedKnowledge
      .map((item) => catalog.byId.get(item.knowledgeId))
      .filter((entity): entity is RuleKnowledge => entity?.type === "rule");
    const items = rules.map((rule) => this.evaluate(rule, prototype));
    return { valid: !items.some((item) => item.status === "failed" && item.severity === "error"), items };
  }

  formatErrors(result: KnowledgeComplianceResult): string {
    return result.items.filter((item) => item.status === "failed" && item.severity === "error")
      .map((item) => `[knowledge-rule] ${item.knowledgeId}@${item.version}：${item.message}`).join("\n");
  }

  formatMatrix(result: KnowledgeComplianceResult): string {
    return ["| 知识规则 | 名称 | 严重度 | 结果 | 说明 |", "|---|---|---|---|---|", ...result.items.map((item) =>
      `| ${item.knowledgeId}@${item.version} | ${item.name} | ${item.severity} | ${item.status} | ${item.message} |`)].join("\n");
  }

  private evaluate(rule: RuleKnowledge, prototype: PrototypeDsl): KnowledgeComplianceItem {
    const base = { knowledgeId: rule.id, version: rule.version, name: rule.name, severity: rule.severity };
    if (rule.checkType !== "prototype") return { ...base, status: "manual", message: "需要人工评审" };
    if (rule.id === "rule.required-field") {
      const invalid = prototype.pages.filter((page) => page.pattern === "form")
        .filter((page) => page.fields.length === 0 || !page.fields.some((field) => field.required && field.label.trim()));
      return invalid.length === 0 ? { ...base, status: "passed", message: "表单页已声明必填字段与标签" }
        : { ...base, status: "failed", message: `表单页缺少必填字段：${invalid.map((page) => page.name).join("、")}` };
    }
    if (rule.id === "rule.status-visible") {
      const invalid = prototype.pages.filter((page) => page.pattern === "list" || page.pattern === "detail")
        .filter((page) => !page.fields.some((field) => field.id === "status" || field.label.includes("状态")));
      return invalid.length === 0 ? { ...base, status: "passed", message: "列表页和详情页均展示状态" }
        : { ...base, status: "failed", message: `页面缺少状态展示：${invalid.map((page) => page.name).join("、")}` };
    }
    if (rule.id === "rule.destructive-confirmation") {
      const unsafe = prototype.pages.flatMap((page) => page.actions.filter((action) => action.kind === "danger" && action.confirmation !== true)
        .map((action) => `${page.name}/${action.label}`));
      return unsafe.length === 0 ? { ...base, status: "passed", message: "危险操作均配置确认机制" }
        : { ...base, status: "failed", message: `危险操作缺少确认机制：${unsafe.join("、")}` };
    }
    return { ...base, status: "manual", message: `暂不支持自动执行断言：${rule.assertion.operator} ${rule.assertion.path}` };
  }
}
