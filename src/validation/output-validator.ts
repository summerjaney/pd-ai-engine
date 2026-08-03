import type { PrototypeDsl, StageId, WorkflowContext } from "../domain/types.js";

export interface ValidationIssue {
  code:
    | "empty-output"
    | "missing-heading"
    | "missing-dependency"
    | "invalid-structure"
    | "inconsistent-artifact";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const DEPENDENCIES: Partial<Record<StageId, StageId[]>> = {
  "product-outline": ["requirement-analysis"],
  "product-architecture": ["product-outline"],
  "core-flow": ["requirement-analysis", "product-outline"],
  "page-structure": ["product-outline", "core-flow"],
  prototype: ["page-structure"],
  mastergo: ["prototype"],
  "prototype-confirmation": ["prototype"],
  prd: ["prototype", "prototype-confirmation"],
  review: ["prototype", "prd"],
};

export class OutputValidator {
  validateDependencies(stage: StageId, context: Readonly<WorkflowContext>): ValidationResult {
    const issues: ValidationIssue[] = [];
    for (const dependency of DEPENDENCIES[stage] ?? []) {
      if (context.artifacts[dependency] === undefined) {
        issues.push({
          code: "missing-dependency",
          message: `${stage} 缺少前置成果物：${dependency}`,
        });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  validateText(content: string): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (!content.trim()) {
      issues.push({ code: "empty-output", message: "模型输出为空。" });
    } else if (!/^#\s+.+/m.test(content)) {
      issues.push({ code: "missing-heading", message: "Markdown 成果物缺少一级标题。" });
    }
    return { valid: issues.length === 0, issues };
  }

  validatePrototype(prototype: PrototypeDsl): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (
      prototype?.schemaVersion !== "0.2"
      || !prototype.product?.name
      || !Array.isArray(prototype.navigation)
      || !Array.isArray(prototype.pages)
      || prototype.pages.length === 0
      || !Array.isArray(prototype.rules)
      || !Array.isArray(prototype.transitions)
      || !prototype.designTokens
    ) {
      issues.push({
        code: "invalid-structure",
        message: "Prototype DSL 缺少必需结构、页面为空或 schemaVersion 不是 0.2。",
      });
      return { valid: false, issues };
    }

    const pageIds = new Set(prototype.pages.map((page) => page.id));
    const duplicatePageIds = prototype.pages
      .map((page) => page.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index);
    if (duplicatePageIds.length > 0) {
      issues.push({
        code: "invalid-structure",
        message: `Prototype DSL 存在重复页面 ID：${[...new Set(duplicatePageIds)].join("、")}`,
      });
    }

    for (const item of prototype.navigation) {
      if (!pageIds.has(item.pageId)) {
        issues.push({
          code: "inconsistent-artifact",
          message: `导航“${item.label}”引用了不存在的页面：${item.pageId}`,
        });
      }
    }
    for (const transition of prototype.transitions) {
      if (!pageIds.has(transition.sourcePageId) || !pageIds.has(transition.targetPageId)) {
        issues.push({
          code: "inconsistent-artifact",
          message: `页面跳转引用了不存在的页面：${transition.sourcePageId} → ${transition.targetPageId}`,
        });
      }
    }
    for (const rule of prototype.rules) {
      const missingPages = (rule.appliesTo ?? []).filter((pageId) => !pageIds.has(pageId));
      if (missingPages.length > 0) {
        issues.push({
          code: "inconsistent-artifact",
          message: `规则“${rule.id}”引用了不存在的页面：${missingPages.join("、")}`,
        });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  validatePrototypeAgainstPageStructure(
    prototype: PrototypeDsl,
    pageStructure: string | undefined,
  ): ValidationResult {
    if (!pageStructure?.trim()) return { valid: true, issues: [] };
    const missingPages = prototype.pages
      .map((page) => page.name)
      .filter((name) => !pageStructure.includes(name));
    return {
      valid: missingPages.length === 0,
      issues: missingPages.length === 0 ? [] : [{
        code: "inconsistent-artifact",
        message: `Prototype 页面未在页面结构成果物中定义：${missingPages.join("、")}`,
      }],
    };
  }

  validatePrdAgainstPrototype(prd: string, prototype: PrototypeDsl): ValidationResult {
    const requiredLabels = prototype.pages.flatMap((page) => [
      page.name,
      ...page.fields.map((field) => field.label),
      ...page.actions.map((action) => action.label),
    ]);
    const missingLabels = [...new Set(requiredLabels)].filter((label) => !prd.includes(label));
    return {
      valid: missingLabels.length === 0,
      issues: missingLabels.length === 0 ? [] : [{
        code: "inconsistent-artifact",
        message: `PRD 缺少 Prototype 中的页面、字段或操作：${missingLabels.join("、")}`,
      }],
    };
  }

  formatValidationErrors(result: ValidationResult): string {
    return result.issues.map((issue) => `[${issue.code}] ${issue.message}`).join("\n");
  }
}
