import type { PrototypeAction, PrototypeDsl, RequirementContext } from "../domain/types.js";
import type { ManualSourceReference, ManualTraceabilityMatrix, OperationManual, ProductManual } from "./types.js";

const actionRoles = (action: PrototypeAction, allRoles: string[]): string[] => action.roles?.length ? [...action.roles] : [...allRoles];

const pageRoles = (prototype: PrototypeDsl, pageId: string, allRoles: string[]): string[] => {
  const navigationRoles = prototype.navigation.filter((item) => item.pageId === pageId).flatMap((item) => item.roles ?? []);
  if (navigationRoles.length > 0) return [...new Set(navigationRoles)];
  const actionRoleList = prototype.pages.find((page) => page.id === pageId)?.actions.flatMap((action) => action.roles ?? []) ?? [];
  return actionRoleList.length > 0 ? [...new Set(actionRoleList)] : [...allRoles];
};

export function generateManuals(prototype: PrototypeDsl, prd: string, requirement?: RequirementContext): {
  productManual: ProductManual;
  operationManual: OperationManual;
  traceability: ManualTraceabilityMatrix;
} {
  const roles = [...new Set([
    ...prototype.navigation.flatMap((item) => item.roles ?? []),
    ...prototype.pages.flatMap((page) => page.actions.flatMap((action) => action.roles ?? [])),
  ])].sort();
  if (roles.length === 0) roles.push("用户");

  const productManual: ProductManual = {
    schemaVersion: "0.8",
    requirementId: requirement?.requirementId,
    title: `${prototype.product.name}产品手册`,
    product: { ...prototype.product },
    roles: roles.map((name) => ({
      name,
      pageIds: prototype.pages.filter((page) => pageRoles(prototype, page.id, roles).includes(name)).map((page) => page.id),
    })),
    modules: prototype.pages.map((page) => ({
      id: `module:${page.id}`,
      name: page.name,
      route: page.route,
      purpose: `${page.name}用于${page.pattern === "list" ? "查询和管理数据" : page.pattern === "form" ? "录入和维护数据" : "查看数据详情"}。`,
      fields: page.fields.map((field) => ({ id: field.id, label: field.label, required: field.required })),
      actions: page.actions.map((action) => ({ id: action.id, label: action.label, kind: action.kind, confirmation: Boolean(action.confirmation), roles: actionRoles(action, roles) })),
      sourceReferences: [
        { kind: "prototype-page", sourceId: page.id },
        ...page.fields.map((field): ManualSourceReference => ({ kind: "prototype-field", sourceId: `${page.id}:${field.id}` })),
        ...page.actions.map((action): ManualSourceReference => ({ kind: "prototype-action", sourceId: `${page.id}:${action.id}` })),
      ],
    })),
    rules: prototype.rules.map((rule) => ({ ...rule, sourceReferences: [{ kind: "prototype-rule", sourceId: rule.id }] })),
  };

  const roleGuides = roles.map((role) => ({
    role,
    operations: prototype.pages.flatMap((page) => page.actions
      .filter((action) => actionRoles(action, roles).includes(role))
      .map((action) => {
        const transition = prototype.transitions.find((item) => item.sourcePageId === page.id && item.triggerId === action.id);
        const target = transition ? prototype.pages.find((item) => item.id === transition.targetPageId) : undefined;
        return {
          id: `operation:${role}:${page.id}:${action.id}`,
          title: `${action.label}${page.name}`,
          entryPageId: page.id,
          preconditions: [`以${role}身份进入${page.name}`, ...(action.confirmation ? ["确认已了解该操作的业务影响"] : [])],
          steps: [{ order: 1, pageId: page.id, actionId: action.id, instruction: `在${page.name}点击“${action.label}”`, targetPageId: transition?.targetPageId }],
          expectedResult: target ? `进入${target.name}` : `${action.label}操作完成并获得明确结果反馈`,
          failureHandling: prototype.errorFeedback?.operationFailureMessage,
          sourceReferences: [
            { kind: "prototype-page", sourceId: page.id } as ManualSourceReference,
            { kind: "prototype-action", sourceId: `${page.id}:${action.id}` } as ManualSourceReference,
            ...(transition ? [{ kind: "prototype-transition", sourceId: `${transition.sourcePageId}:${transition.triggerId}:${transition.targetPageId}` } as ManualSourceReference] : []),
          ],
        };
      })),
  }));

  const operationManual: OperationManual = {
    schemaVersion: "0.8",
    requirementId: requirement?.requirementId,
    title: `${prototype.product.name}操作手册`,
    roleGuides,
  };

  const sources: ManualSourceReference[] = [
    ...(requirement ? [{ kind: "requirement", sourceId: requirement.requirementId } as ManualSourceReference] : []),
    { kind: "prd", sourceId: prd.includes("#") ? "09-prd.md" : "prd" },
    ...prototype.pages.flatMap((page) => [
      { kind: "prototype-page", sourceId: page.id } as ManualSourceReference,
      ...page.fields.map((field): ManualSourceReference => ({ kind: "prototype-field", sourceId: `${page.id}:${field.id}` })),
      ...page.actions.map((action): ManualSourceReference => ({ kind: "prototype-action", sourceId: `${page.id}:${action.id}` })),
    ]),
    ...prototype.rules.map((rule): ManualSourceReference => ({ kind: "prototype-rule", sourceId: rule.id })),
    ...prototype.transitions.map((item): ManualSourceReference => ({ kind: "prototype-transition", sourceId: `${item.sourcePageId}:${item.triggerId}:${item.targetPageId}` })),
  ];
  const uniqueSources = [...new Map(sources.map((source) => [`${source.kind}:${source.sourceId}`, source])).values()];
  const operations = operationManual.roleGuides.flatMap((guide) => guide.operations);
  const items = uniqueSources.map((source) => ({
    sourceKind: source.kind,
    sourceId: source.sourceId,
    productManualSectionIds: productManual.modules.filter((module) => module.sourceReferences.some((ref) => ref.kind === source.kind && ref.sourceId === source.sourceId)).map((module) => module.id)
      .concat(productManual.rules.filter((rule) => rule.sourceReferences.some((ref) => ref.kind === source.kind && ref.sourceId === source.sourceId)).map((rule) => `rule:${rule.id}`)),
    operationIds: operations.filter((operation) => operation.sourceReferences.some((ref) => ref.kind === source.kind && ref.sourceId === source.sourceId)).map((operation) => operation.id),
  }));
  const coveredCount = items.filter((item) => item.productManualSectionIds.length > 0 || item.operationIds.length > 0 || item.sourceKind === "prd" || item.sourceKind === "requirement").length;
  const traceability: ManualTraceabilityMatrix = {
    schemaVersion: "0.8",
    requirementId: requirement?.requirementId,
    items,
    summary: { sourceCount: items.length, coveredCount, missingCount: items.length - coveredCount, coverageRate: items.length ? coveredCount / items.length : 1 },
  };
  return { productManual, operationManual, traceability };
}

export function renderProductManual(manual: ProductManual): string {
  const roles = manual.roles.map((role) => `- ${role.name}：可访问 ${role.pageIds.length} 个页面`).join("\n");
  const modules = manual.modules.map((module) => `## ${module.name}\n\n- 页面 ID：${module.id.replace("module:", "")}\n- 路由：${module.route}\n- 功能说明：${module.purpose}\n\n### 字段\n\n${module.fields.length ? module.fields.map((field) => `- ${field.label}${field.required ? "（必填）" : ""}`).join("\n") : "无。"}\n\n### 操作\n\n${module.actions.length ? module.actions.map((action) => `- ${action.label}${action.confirmation ? "（需二次确认）" : ""}；角色：${action.roles.join("、")}`).join("\n") : "无。"}`).join("\n\n");
  const rules = manual.rules.length ? manual.rules.map((rule) => `- ${rule.id}：${rule.description}`).join("\n") : "无。";
  return `# ${manual.title}\n\n${manual.product.description}\n\n## 用户角色\n\n${roles}\n\n${modules}\n\n## 业务规则\n\n${rules}\n`;
}

export function renderOperationManual(manual: OperationManual): string {
  const guides = manual.roleGuides.map((guide) => `## ${guide.role}\n\n${guide.operations.map((operation, index) => `### ${index + 1}. ${operation.title}\n\n- 前置条件：${operation.preconditions.join("；")}\n- 操作步骤：${operation.steps.map((step) => `${step.order}. ${step.instruction}`).join("；")}\n- 预期结果：${operation.expectedResult}${operation.failureHandling ? `\n- 失败处理：${operation.failureHandling}` : ""}`).join("\n\n")}`).join("\n\n");
  return `# ${manual.title}\n\n${guides}\n`;
}
