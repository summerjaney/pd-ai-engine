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

    if (!prototype || typeof prototype !== "object") {
      issues.push({ code: "invalid-structure", message: "Prototype DSL 顶层不是对象。" });
      return { valid: false, issues };
    }

    if (prototype.schemaVersion !== "0.2") {
      const actual = prototype.schemaVersion === undefined ? "缺失" : JSON.stringify(prototype.schemaVersion);
      issues.push({
        code: "invalid-structure",
        message: `schemaVersion 必须为 "0.2"，实际为 ${actual}。`,
      });
    }

    if (!prototype.product || typeof prototype.product !== "object") {
      issues.push({ code: "invalid-structure", message: "product 缺失或不是对象。" });
    } else {
      if (!prototype.product.name) {
        issues.push({ code: "invalid-structure", message: "product.name 缺失或为空。" });
      }
      if (!prototype.product.description) {
        issues.push({ code: "invalid-structure", message: "product.description 缺失或为空。" });
      }
    }

    if (!Array.isArray(prototype.navigation)) {
      issues.push({ code: "invalid-structure", message: "navigation 缺失或不是数组。" });
    }
    if (!Array.isArray(prototype.pages)) {
      issues.push({ code: "invalid-structure", message: "pages 缺失或不是数组。" });
      return { valid: false, issues };
    }
    if (prototype.pages.length === 0) {
      issues.push({ code: "invalid-structure", message: "pages 为空数组，至少需要一个页面。" });
      return { valid: false, issues };
    }
    if (!Array.isArray(prototype.rules)) {
      issues.push({ code: "invalid-structure", message: "rules 缺失或不是数组。" });
    }
    if (!Array.isArray(prototype.transitions)) {
      issues.push({ code: "invalid-structure", message: "transitions 缺失或不是数组。" });
    }
    if (!prototype.designTokens || typeof prototype.designTokens !== "object") {
      issues.push({ code: "invalid-structure", message: "designTokens 缺失或不是对象。" });
    }
    if (prototype.errorFeedback !== undefined) {
      const feedback = prototype.errorFeedback;
      if (!feedback || typeof feedback !== "object"
        || !feedback.validationMessage?.trim()
        || !feedback.operationFailureMessage?.trim()
        || !feedback.recoveryAction?.trim()) {
        issues.push({
          code: "invalid-structure",
          message: "errorFeedback 必须包含非空 validationMessage、operationFailureMessage 和 recoveryAction。",
        });
      }
    }

    const pageIds = new Set<string>();
    prototype.pages.forEach((page, index) => {
      const path = `pages[${index}]`;
      if (!page || typeof page !== "object") {
        issues.push({ code: "invalid-structure", message: `${path} 不是对象。` });
        return;
      }
      if (!page.id) {
        issues.push({ code: "invalid-structure", message: `${path}.id 缺失或为空。` });
      } else if (pageIds.has(page.id)) {
        issues.push({ code: "invalid-structure", message: `${path}.id 重复：${page.id}` });
      } else {
        pageIds.add(page.id);
      }
      if (!page.name) issues.push({ code: "invalid-structure", message: `${path}.name 缺失或为空。` });
      if (!page.route) issues.push({ code: "invalid-structure", message: `${path}.route 缺失或为空。` });
      if (page.pattern !== "list" && page.pattern !== "form" && page.pattern !== "detail") {
        const actual = page.pattern === undefined ? "缺失" : JSON.stringify(page.pattern);
        issues.push({ code: "invalid-structure", message: `${path}.pattern 必须为 list/form/detail，实际为 ${actual}。` });
      }
      if (!Array.isArray(page.fields)) {
        issues.push({ code: "invalid-structure", message: `${path}.fields 缺失或不是数组。` });
      } else {
        page.fields.forEach((field, fieldIndex) => {
          const fieldPath = `${path}.fields[${fieldIndex}]`;
          if (!field || typeof field !== "object") {
            issues.push({ code: "invalid-structure", message: `${fieldPath} 不是对象。` });
            return;
          }
          if (!field.id) issues.push({ code: "invalid-structure", message: `${fieldPath}.id 缺失或为空。` });
          if (!field.label) issues.push({ code: "invalid-structure", message: `${fieldPath}.label 缺失或为空。` });
          if (field.type !== "text" && field.type !== "textarea" && field.type !== "select" && field.type !== "datetime") {
            const actual = field.type === undefined ? "缺失" : JSON.stringify(field.type);
            issues.push({ code: "invalid-structure", message: `${fieldPath}.type 必须为 text/textarea/select/datetime，实际为 ${actual}。` });
          }
          if (typeof field.required !== "boolean") {
            const actual = field.required === undefined ? "缺失" : JSON.stringify(field.required);
            issues.push({ code: "invalid-structure", message: `${fieldPath}.required 必须为布尔值，实际为 ${actual}。` });
          }
          if (field.optionsSource !== undefined && (typeof field.optionsSource !== "string" || !field.optionsSource.trim())) {
            issues.push({ code: "invalid-structure", message: `${fieldPath}.optionsSource 必须为非空字符串。` });
          }
        });
      }
      if (!Array.isArray(page.actions)) {
        issues.push({ code: "invalid-structure", message: `${path}.actions 缺失或不是数组。` });
      } else {
        page.actions.forEach((action, actionIndex) => {
          const actionPath = `${path}.actions[${actionIndex}]`;
          if (!action || typeof action !== "object") {
            issues.push({ code: "invalid-structure", message: `${actionPath} 不是对象。` });
            return;
          }
          if (!action.id) issues.push({ code: "invalid-structure", message: `${actionPath}.id 缺失或为空。` });
          if (!action.label) issues.push({ code: "invalid-structure", message: `${actionPath}.label 缺失或为空。` });
          if (action.kind !== "primary" && action.kind !== "secondary" && action.kind !== "danger") {
            const actual = action.kind === undefined ? "缺失" : JSON.stringify(action.kind);
            issues.push({ code: "invalid-structure", message: `${actionPath}.kind 必须为 primary/secondary/danger，实际为 ${actual}。` });
          }
          if (action.confirmation !== undefined && typeof action.confirmation !== "boolean") {
            issues.push({ code: "invalid-structure", message: `${actionPath}.confirmation 必须为布尔值。` });
          }
          if (action.confirmationMessage !== undefined && (typeof action.confirmationMessage !== "string" || !action.confirmationMessage.trim())) {
            issues.push({ code: "invalid-structure", message: `${actionPath}.confirmationMessage 必须为非空字符串。` });
          }
          if (action.roles !== undefined && (!Array.isArray(action.roles) || action.roles.length === 0 || action.roles.some((role) => typeof role !== "string" || !role.trim()))) {
            issues.push({ code: "invalid-structure", message: `${actionPath}.roles 必须为非空字符串数组。` });
          }
        });
      }
      if (page.tableColumns !== undefined && (!Array.isArray(page.tableColumns) || page.tableColumns.some((id) => typeof id !== "string" || !page.fields.some((field) => field.id === id)))) {
        issues.push({ code: "inconsistent-artifact", message: `${path}.tableColumns 必须引用本页 fields 中的字段 id。` });
      }
      if (page.pagination !== undefined && (typeof page.pagination.enabled !== "boolean" || !Number.isInteger(page.pagination.pageSize) || page.pagination.pageSize <= 0)) {
        issues.push({ code: "invalid-structure", message: `${path}.pagination 必须包含 enabled 布尔值和正整数 pageSize。` });
      }
      if (page.emptyState !== undefined) {
        if (!page.emptyState.description?.trim()) issues.push({ code: "invalid-structure", message: `${path}.emptyState.description 缺失或为空。` });
        if (page.emptyState.actionId && !page.actions.some((action) => action.id === page.emptyState!.actionId)) {
          issues.push({ code: "inconsistent-artifact", message: `${path}.emptyState.actionId 引用了不存在的操作：${page.emptyState.actionId}` });
        }
      }
    });

    if (Array.isArray(prototype.navigation)) {
      prototype.navigation.forEach((item, index) => {
        const path = `navigation[${index}]`;
        if (!item || typeof item !== "object") {
          issues.push({ code: "invalid-structure", message: `${path} 不是对象。` });
          return;
        }
        if (!item.label) {
          issues.push({ code: "invalid-structure", message: `${path}.label 缺失或为空。` });
        }
        if (!item.pageId) {
          issues.push({ code: "invalid-structure", message: `${path}.pageId 缺失或为空。` });
        } else if (pageIds.size > 0 && !pageIds.has(item.pageId)) {
          issues.push({
            code: "inconsistent-artifact",
            message: `${path}.pageId 引用了不存在的页面：${item.pageId}`,
          });
        }
      });
    }

    if (Array.isArray(prototype.transitions)) {
      prototype.transitions.forEach((transition, index) => {
        const path = `transitions[${index}]`;
        if (!transition || typeof transition !== "object") {
          issues.push({ code: "invalid-structure", message: `${path} 不是对象。` });
          return;
        }
        if (!transition.sourcePageId) {
          issues.push({ code: "invalid-structure", message: `${path}.sourcePageId 缺失或为空。` });
        } else if (pageIds.size > 0 && !pageIds.has(transition.sourcePageId)) {
          issues.push({
            code: "inconsistent-artifact",
            message: `${path}.sourcePageId 引用了不存在的页面：${transition.sourcePageId}`,
          });
        }
        if (transition.triggerType !== "navigation" && transition.triggerType !== "action") {
          const actual = transition.triggerType === undefined ? "缺失" : JSON.stringify(transition.triggerType);
          issues.push({ code: "invalid-structure", message: `${path}.triggerType 必须为 navigation/action，实际为 ${actual}。` });
        }
        if (!transition.triggerId) {
          issues.push({ code: "invalid-structure", message: `${path}.triggerId 缺失或为空。` });
        }
        if (!transition.triggerLabel) {
          issues.push({ code: "invalid-structure", message: `${path}.triggerLabel 缺失或为空。` });
        }
        if (!transition.targetPageId) {
          issues.push({ code: "invalid-structure", message: `${path}.targetPageId 缺失或为空。` });
        } else if (pageIds.size > 0 && !pageIds.has(transition.targetPageId)) {
          issues.push({
            code: "inconsistent-artifact",
            message: `${path}.targetPageId 引用了不存在的页面：${transition.targetPageId}`,
          });
        }
      });
    }

    if (Array.isArray(prototype.rules)) {
      prototype.rules.forEach((rule, index) => {
        const path = `rules[${index}]`;
        if (!rule || typeof rule !== "object") {
          issues.push({ code: "invalid-structure", message: `${path} 不是对象。` });
          return;
        }
        if (!rule.id) {
          issues.push({ code: "invalid-structure", message: `${path}.id 缺失或为空。` });
        }
        if (!rule.description) {
          issues.push({ code: "invalid-structure", message: `${path}.description 缺失或为空。` });
        }
        const appliesTo = rule.appliesTo ?? [];
        if (!Array.isArray(appliesTo)) {
          issues.push({ code: "invalid-structure", message: `${path}.appliesTo 不是数组。` });
        } else {
          const missingPages = appliesTo.filter((pageId) => pageIds.size > 0 && !pageIds.has(pageId));
          if (missingPages.length > 0) {
            issues.push({
              code: "inconsistent-artifact",
              message: `${path}.appliesTo 引用了不存在的页面：${missingPages.join("、")}`,
            });
          }
        }
        if ("applies_to" in rule) {
          issues.push({
            code: "invalid-structure",
            message: `${path} 含有非标准字段 applies_to，应使用 camelCase 的 appliesTo。`,
          });
        }
      });
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
