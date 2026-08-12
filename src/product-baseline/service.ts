import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrototypeDsl, RequirementContext } from "../domain/types.js";
import {
  PRODUCT_BASELINE_SCHEMA_VERSION,
  type ProductBaseline,
  type ProductBaselineSource,
  type ProductBaselineValidationResult,
} from "./types.js";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "hash")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function calculateProductBaselineHash(baseline: ProductBaseline): string {
  return createHash("sha256").update(canonicalJson(baseline)).digest("hex");
}

export function validateProductBaseline(value: unknown): ProductBaselineValidationResult {
  const issues: ProductBaselineValidationResult["issues"] = [];
  const baseline = value as Partial<ProductBaseline> | null;
  if (!baseline || typeof baseline !== "object") return { valid: false, issues: [{ path: "$", message: "产品基线必须是 JSON 对象。" }] };
  if (baseline.schemaVersion !== PRODUCT_BASELINE_SCHEMA_VERSION) issues.push({ path: "schemaVersion", message: `仅支持 ${PRODUCT_BASELINE_SCHEMA_VERSION}。` });
  if (!baseline.project?.id || !baseline.project.name) issues.push({ path: "project", message: "缺少项目标识或名称。" });
  if (!baseline.product?.name || !baseline.product.version) issues.push({ path: "product", message: "缺少产品名称或版本。" });
  if (baseline.baseline?.status !== "accepted") issues.push({ path: "baseline.status", message: "正式基线状态必须为 accepted。" });
  if (!Number.isInteger(baseline.baseline?.sequence) || (baseline.baseline?.sequence ?? 0) < 1) issues.push({ path: "baseline.sequence", message: "基线序号必须是正整数。" });
  for (const key of ["requirements", "modules", "pages", "rules"] as const) {
    if (!Array.isArray(baseline[key])) issues.push({ path: key, message: `${key} 必须是数组。` });
  }
  if (Array.isArray(baseline.pages)) {
    const ids = new Set<string>();
    const routes = new Set<string>();
    for (const [index, page] of baseline.pages.entries()) {
      if (!page.id || ids.has(page.id)) issues.push({ path: `pages[${index}].id`, message: "页面 ID 缺失或重复。" });
      if (!page.route || routes.has(page.route)) issues.push({ path: `pages[${index}].route`, message: "页面路由缺失或重复。" });
      ids.add(page.id);
      routes.add(page.route);
    }
  }
  if (baseline.baseline?.hash && baseline.baseline.hash !== calculateProductBaselineHash(baseline as ProductBaseline)) {
    issues.push({ path: "baseline.hash", message: "产品基线哈希不匹配，文件可能已损坏或被篡改。" });
  }
  return { valid: issues.length === 0, issues };
}

export function buildInitialProductBaseline(prototype: PrototypeDsl, requirement: RequirementContext, now = new Date().toISOString()): ProductBaseline {
  const source: ProductBaselineSource = {
    requirementId: requirement.requirementId,
    requirementRevision: requirement.revision,
    artifact: `requirements/${requirement.requirementId}-${requirement.requirementName}/06-prototype/prototype.json`,
  };
  const rolesByPage = new Map<string, Set<string>>();
  for (const item of prototype.navigation) rolesByPage.set(item.pageId, new Set(item.roles ?? []));
  const baseline: ProductBaseline = {
    schemaVersion: PRODUCT_BASELINE_SCHEMA_VERSION,
    project: { id: requirement.projectId, name: requirement.projectName },
    product: { name: prototype.product.name, description: prototype.product.description, version: requirement.productVersion },
    baseline: { sequence: 1, status: "accepted", createdAt: now, updatedAt: now, hash: "" },
    requirements: [{ id: requirement.requirementId, name: requirement.requirementName, revision: requirement.revision, productVersion: requirement.productVersion, acceptedAt: now }],
    modules: prototype.navigation.map((item) => ({
      id: `module:${item.pageId}`,
      name: item.label,
      entryPageId: item.pageId,
      roles: [...(item.roles ?? [])].sort(),
      source,
    })),
    pages: prototype.pages.map((page) => ({
      id: page.id,
      name: page.name,
      route: page.route,
      pattern: page.pattern,
      roles: [...(rolesByPage.get(page.id) ?? new Set<string>())].sort(),
      fields: page.fields.map((field) => ({ id: field.id, name: field.label, type: field.type, required: field.required, source })),
      actions: page.actions.map((action) => ({ id: action.id, name: action.label, kind: action.kind, roles: [...(action.roles ?? [])].sort(), source })),
      source,
    })),
    rules: prototype.rules.map((rule) => ({ ...rule, appliesTo: [...rule.appliesTo].sort(), source })),
  };
  baseline.baseline.hash = calculateProductBaselineHash(baseline);
  return baseline;
}

export async function loadProductBaseline(projectDirectory: string): Promise<ProductBaseline | null> {
  const baselinePath = path.join(projectDirectory, "product", "product-baseline.json");
  try {
    const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as ProductBaseline;
    const validation = validateProductBaseline(baseline);
    if (!validation.valid) throw new Error(`产品基线校验失败：${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
    return baseline;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function establishInitialProductBaseline(projectDirectory: string, requirementDirectory: string, requirement: RequirementContext): Promise<{ created: boolean; baseline: ProductBaseline }> {
  const existing = await loadProductBaseline(projectDirectory);
  if (existing) return { created: false, baseline: existing };
  const prototype = JSON.parse(await readFile(path.join(requirementDirectory, "06-prototype", "prototype.json"), "utf8")) as PrototypeDsl;
  const baseline = buildInitialProductBaseline(prototype, requirement);
  const validation = validateProductBaseline(baseline);
  if (!validation.valid) throw new Error(`无法建立产品基线：${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
  const productDirectory = path.join(projectDirectory, "product");
  const target = path.join(productDirectory, "product-baseline.json");
  const temporary = `${target}.tmp`;
  await mkdir(productDirectory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  await access(target);
  return { created: true, baseline };
}
