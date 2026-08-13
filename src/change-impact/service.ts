import type { PrototypeDsl, RequirementContext, RequirementInput } from "../domain/types.js";
import type { ProductBaseline } from "../product-baseline/types.js";
import type { ChangeEntityKind, ChangeImpactReport, ProductChange, ProductConflict } from "./types.js";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const normalized = (items: string[] | undefined) => [...(items ?? [])].sort();

function properties(current: Record<string, unknown>, proposed: Record<string, unknown>, keys: string[]): string[] {
  return keys.filter((key) => !same(current[key], proposed[key]));
}

function add(changes: ProductChange[], kind: ChangeEntityKind, id: string, name: string, parentId?: string): void {
  changes.push({ operation: "ADD", kind, id, name, parentId, changedProperties: [] });
}

export function analyzeChangeImpact(baseline: ProductBaseline, prototype: PrototypeDsl, input: RequirementInput, requirement: RequirementContext): ChangeImpactReport {
  const changes: ProductChange[] = [];
  const conflicts: ProductConflict[] = [];
  const deletionIntent = /删除|移除|下线|废弃|delet|remov|deprecat/i.test(`${input.title}\n${input.content}`);
  const proposedPageIds = new Set<string>();
  const proposedRoutes = new Set<string>();

  for (const page of prototype.pages) {
    if (proposedPageIds.has(page.id)) conflicts.push({ code: "DUPLICATE_ID", severity: "ERROR", message: `提案中页面 ID ${page.id} 重复。`, entityId: page.id });
    if (proposedRoutes.has(page.route)) conflicts.push({ code: "DUPLICATE_ROUTE", severity: "ERROR", message: `提案中页面路由 ${page.route} 重复。`, entityId: page.id });
    proposedPageIds.add(page.id); proposedRoutes.add(page.route);
    const current = baseline.pages.find((item) => item.id === page.id);
    const routeOwner = baseline.pages.find((item) => item.route === page.route && item.id !== page.id);
    if (routeOwner) conflicts.push({ code: "DUPLICATE_ROUTE", severity: "ERROR", message: `路由 ${page.route} 已由页面 ${routeOwner.id} 使用。`, entityId: page.id });
    if (!current) { add(changes, "page", page.id, page.name); }
    else {
      const changed = properties(current as unknown as Record<string, unknown>, { name: page.name, route: page.route, pattern: page.pattern, roles: normalized(prototype.navigation.find((n) => n.pageId === page.id)?.roles) }, ["name", "route", "pattern", "roles"]);
      if (changed.length) {
        changes.push({ operation: changed.includes("roles") ? "PERMISSION_CHANGE" : "MODIFY", kind: "page", id: page.id, name: page.name, changedProperties: changed, source: current.source });
        if (changed.some((key) => key !== "roles")) conflicts.push({ code: "PAGE_DEFINITION_CONFLICT", severity: "CONFIRMATION_REQUIRED", message: `页面 ${page.id} 的 ${changed.join("、")} 与正式基线不同。`, entityId: page.id });
      }
    }
    for (const field of page.fields) {
      const existing = current?.fields.find((item) => item.id === field.id);
      if (!existing) add(changes, "field", field.id, field.label, page.id);
      else {
        const changed = properties(existing as unknown as Record<string, unknown>, { name: field.label, type: field.type, required: field.required }, ["name", "type", "required"]);
        if (changed.length) {
          changes.push({ operation: "MODIFY", kind: "field", id: field.id, name: field.label, parentId: page.id, changedProperties: changed, source: existing.source });
          if (changed.includes("type")) conflicts.push({ code: "FIELD_DEFINITION_CONFLICT", severity: "ERROR", message: `字段 ${page.id}.${field.id} 类型由 ${existing.type} 变为 ${field.type}。`, entityId: field.id });
        }
      }
    }
    for (const action of page.actions) {
      const existing = current?.actions.find((item) => item.id === action.id);
      if (!existing) add(changes, "action", action.id, action.label, page.id);
      else {
        const changed = properties(existing as unknown as Record<string, unknown>, { name: action.label, kind: action.kind, roles: normalized(action.roles) }, ["name", "kind", "roles"]);
        if (changed.length) changes.push({ operation: changed.includes("roles") ? "PERMISSION_CHANGE" : "MODIFY", kind: "action", id: action.id, name: action.label, parentId: page.id, changedProperties: changed, source: existing.source });
        if (changed.includes("roles")) conflicts.push({ code: "PERMISSION_CONFLICT", severity: "CONFIRMATION_REQUIRED", message: `操作 ${page.id}.${action.id} 的角色范围发生变化。`, entityId: action.id });
      }
    }
  }
  for (const rule of prototype.rules) {
    const current = baseline.rules.find((item) => item.id === rule.id);
    if (!current) add(changes, "rule", rule.id, rule.description);
    else if (current.description !== rule.description || !same(current.appliesTo, normalized(rule.appliesTo))) {
      changes.push({ operation: "MODIFY", kind: "rule", id: rule.id, name: rule.description, changedProperties: ["description", "appliesTo"], source: current.source });
      conflicts.push({ code: "RULE_CONFLICT", severity: "CONFIRMATION_REQUIRED", message: `规则 ${rule.id} 与正式基线定义不同。`, entityId: rule.id });
    }
  }
  if (deletionIntent) for (const page of baseline.pages) if (!proposedPageIds.has(page.id) && input.content.includes(page.name)) {
    changes.push({ operation: "DELETE", kind: "page", id: page.id, name: page.name, changedProperties: [], source: page.source });
    conflicts.push({ code: "UNCONFIRMED_DELETE", severity: "CONFIRMATION_REQUIRED", message: `删除已发布页面 ${page.name} 必须由产品经理确认。`, entityId: page.id });
  }
  const affected = new Set<string>(["product-baseline.json", "product-diff", "requirement-index.md", "change-log.md"]);
  for (const item of changes) {
    if (["module", "page"].includes(item.kind)) { affected.add("product-overview.md"); affected.add("product-architecture.md"); }
    if (["page", "field", "action", "rule"].includes(item.kind)) { affected.add("prototype"); affected.add("MasterGo"); affected.add("PRD"); affected.add("product-manual"); affected.add("operation-manual"); affected.add("acceptance-tests"); }
  }
  const count = (operation: ProductChange["operation"]) => changes.filter((item) => item.operation === operation).length;
  const severity = (value: ProductConflict["severity"]) => conflicts.filter((item) => item.severity === value).length;
  return { schemaVersion: "1.1", baseline: { sequence: baseline.baseline.sequence, hash: baseline.baseline.hash, productVersion: baseline.product.version }, requirement: { id: requirement.requirementId, revision: requirement.revision }, summary: { add: count("ADD"), modify: changes.filter((i) => ["MODIFY", "PERMISSION_CHANGE", "FLOW_CHANGE", "MIGRATE"].includes(i.operation)).length, delete: count("DELETE"), unresolved: count("UNRESOLVED"), error: severity("ERROR"), warning: severity("WARNING"), confirmationRequired: severity("CONFIRMATION_REQUIRED") }, changes, conflicts, affectedArtifacts: [...affected].sort(), canProceed: severity("ERROR") === 0 && severity("CONFIRMATION_REQUIRED") === 0 };
}

export function renderChangeImpactReport(report: ChangeImpactReport): string {
  const lines = ["# 产品变更影响分析", "", `- 基线：#${report.baseline.sequence}（${report.baseline.productVersion}）`, `- 需求：${report.requirement.id} r${report.requirement.revision}`, `- 结论：${report.canProceed ? "可进入基线接受流程" : "存在阻断或待确认项"}`, "", "## 变更", ""];
  lines.push(...(report.changes.length ? report.changes.map((item) => `- ${item.operation} ${item.kind} \`${item.id}\` ${item.name}${item.changedProperties.length ? `（${item.changedProperties.join("、")}）` : ""}`) : ["- 无结构化变更"]));
  lines.push("", "## 冲突", "", ...(report.conflicts.length ? report.conflicts.map((item) => `- [${item.severity}] ${item.message}`) : ["- 无"]), "", "## 受影响成果物", "", ...report.affectedArtifacts.map((item) => `- ${item}`), "");
  return lines.join("\n");
}
