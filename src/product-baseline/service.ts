import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrototypeDsl, RequirementContext } from "../domain/types.js";
import {
  PRODUCT_BASELINE_SCHEMA_VERSION,
  type ProductBaseline,
  type ProductBaselineSource,
  type ProductBaselineValidationResult,
  type ProductBaselineAcceptanceResult,
} from "./types.js";
import type { ChangeImpactReport } from "../change-impact/types.js";

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

function sourceFor(requirement: RequirementContext): ProductBaselineSource {
  return { requirementId: requirement.requirementId, requirementRevision: requirement.revision, artifact: `requirements/${requirement.requirementId}-${requirement.requirementName}/06-prototype/prototype.json` };
}

export function applyAcceptedPrototype(current: ProductBaseline, prototype: PrototypeDsl, requirement: RequirementContext, report: ChangeImpactReport, now = new Date().toISOString()): ProductBaseline {
  const source = sourceFor(requirement);
  const next = structuredClone(current);
  next.project.name = requirement.projectName;
  next.product = { name: prototype.product.name, description: prototype.product.description, version: requirement.productVersion };
  next.baseline.sequence += 1;
  next.baseline.updatedAt = now;
  const existingRequirement = next.requirements.find((item) => item.id === requirement.requirementId);
  const acceptedRequirement = { id: requirement.requirementId, name: requirement.requirementName, revision: requirement.revision, productVersion: requirement.productVersion, acceptedAt: now };
  if (existingRequirement) Object.assign(existingRequirement, acceptedRequirement); else next.requirements.push(acceptedRequirement);

  const deletedPages = new Set(report.changes.filter((item) => item.operation === "DELETE" && item.kind === "page").map((item) => item.id));
  next.pages = next.pages.filter((page) => !deletedPages.has(page.id));
  const rolesByPage = new Map(prototype.navigation.map((item) => [item.pageId, [...(item.roles ?? [])].sort()]));
  for (const page of prototype.pages) {
    const proposed = { id: page.id, name: page.name, route: page.route, pattern: page.pattern, roles: rolesByPage.get(page.id) ?? [], fields: page.fields.map((field) => ({ id: field.id, name: field.label, type: field.type, required: field.required, source })), actions: page.actions.map((action) => ({ id: action.id, name: action.label, kind: action.kind, roles: [...(action.roles ?? [])].sort(), source })), source };
    const index = next.pages.findIndex((item) => item.id === page.id);
    if (index >= 0) next.pages[index] = proposed; else next.pages.push(proposed);
  }
  for (const navigation of prototype.navigation) {
    const proposed = { id: `module:${navigation.pageId}`, name: navigation.label, entryPageId: navigation.pageId, roles: [...(navigation.roles ?? [])].sort(), source };
    const index = next.modules.findIndex((item) => item.id === proposed.id);
    if (index >= 0) next.modules[index] = proposed; else next.modules.push(proposed);
  }
  next.modules = next.modules.filter((module) => !deletedPages.has(module.entryPageId));
  for (const rule of prototype.rules) {
    const proposed = { id: rule.id, description: rule.description, appliesTo: [...rule.appliesTo].sort(), source };
    const index = next.rules.findIndex((item) => item.id === rule.id);
    if (index >= 0) next.rules[index] = proposed; else next.rules.push(proposed);
  }
  next.pages.sort((a, b) => a.id.localeCompare(b.id)); next.modules.sort((a, b) => a.id.localeCompare(b.id)); next.rules.sort((a, b) => a.id.localeCompare(b.id)); next.requirements.sort((a, b) => a.id.localeCompare(b.id));
  next.baseline.hash = ""; next.baseline.hash = calculateProductBaselineHash(next);
  return next;
}

function renderOverview(baseline: ProductBaseline): string {
  return [`# ${baseline.product.name}`, "", baseline.product.description, "", `- 当前产品版本：${baseline.product.version}`, `- 正式基线：#${baseline.baseline.sequence}`, `- 已接受需求：${baseline.requirements.length}`, `- 页面数量：${baseline.pages.length}`, "", "## 功能模块", "", ...baseline.modules.map((item) => `- ${item.name}（入口：${item.entryPageId}）`), ""].join("\n");
}
function renderArchitecture(baseline: ProductBaseline): string {
  return ["# 产品总体架构", "", `> 基于正式产品基线 #${baseline.baseline.sequence} 自动维护。`, "", ...baseline.modules.flatMap((module) => { const page = baseline.pages.find((item) => item.id === module.entryPageId); return [`## ${module.name}`, "", `- 入口页面：${page?.name ?? module.entryPageId}`, `- 路由：${page?.route ?? "-"}`, `- 角色：${module.roles.join("、") || "未限定"}`, ""]; })].join("\n");
}
function renderRoadmap(baseline: ProductBaseline): string {
  return ["# 产品路线图", "", "| 产品版本 | 需求编号 | 需求标识 | 修订 | 接受时间 |", "|---|---|---|---:|---|", ...baseline.requirements.map((item) => `| ${item.productVersion} | ${item.id} | ${item.name} | ${item.revision} | ${item.acceptedAt} |`), ""].join("\n");
}
function renderRequirementIndex(baseline: ProductBaseline): string {
  return ["# 需求索引", "", "| 需求编号 | 需求名称 | 产品版本 | 状态 |", "|---|---|---|---|", ...baseline.requirements.map((item) => `| ${item.id} | ${item.name} | ${item.productVersion} | accepted |`), ""].join("\n");
}

export async function acceptProductBaseline(requirementDirectory: string): Promise<ProductBaselineAcceptanceResult> {
  const projectDirectory = path.dirname(path.dirname(requirementDirectory));
  const productDirectory = path.join(projectDirectory, "product");
  const current = await loadProductBaseline(projectDirectory);
  if (!current) throw new Error("不存在可更新的正式产品基线。");
  const [report, prototype, requirement] = await Promise.all([
    readFile(path.join(requirementDirectory, "11-change-impact", "change-impact-report.json"), "utf8").then((value) => JSON.parse(value) as ChangeImpactReport),
    readFile(path.join(requirementDirectory, "06-prototype", "prototype.json"), "utf8").then((value) => JSON.parse(value) as PrototypeDsl),
    readFile(path.join(requirementDirectory, "requirement.json"), "utf8").then((value) => JSON.parse(value) as RequirementContext),
  ]);
  if (report.summary.error > 0) throw new Error(`产品变更包含 ${report.summary.error} 个 ERROR，禁止接受。`);
  if (report.baseline.hash !== current.baseline.hash || report.baseline.sequence !== current.baseline.sequence) throw new Error("影响分析基于过期产品基线，请重新运行需求后再接受。");
  if (report.requirement.id !== requirement.requirementId || report.requirement.revision !== requirement.revision) throw new Error("影响报告与需求身份或修订版本不一致。");
  if (current.requirements.some((item) => item.id === requirement.requirementId && item.revision >= requirement.revision)) throw new Error("该需求修订版本已被接受，不能重复或倒退更新基线。");
  const next = applyAcceptedPrototype(current, prototype, requirement, report);
  const validation = validateProductBaseline(next);
  if (!validation.valid) throw new Error(`更新后的产品基线校验失败：${validation.issues.map((item) => `${item.path} ${item.message}`).join("；")}`);

  const historyDirectory = path.join(productDirectory, "history", `baseline-${current.baseline.sequence}`);
  const baselinePath = path.join(productDirectory, "product-baseline.json");
  await mkdir(historyDirectory, { recursive: true });
  const snapshotPath = path.join(historyDirectory, "product-baseline.json");
  await cp(baselinePath, snapshotPath, { force: false, errorOnExist: true });
  const artifacts: Record<string, string> = { "product-overview.md": renderOverview(next), "product-architecture.md": renderArchitecture(next), "product-roadmap.md": renderRoadmap(next), "requirement-index.md": renderRequirementIndex(next) };
  const changeLogPath = path.join(productDirectory, "change-log.md");
  let changeLog = "# 产品变更日志\n"; try { changeLog = (await readFile(changeLogPath, "utf8")).trimEnd(); } catch {}
  changeLog += `\n\n## 基线 #${next.baseline.sequence} · ${requirement.requirementId} r${requirement.revision}\n\n- 产品版本：${requirement.productVersion}\n- 接受时间：${next.baseline.updatedAt}\n- 变更：新增 ${report.summary.add}，修改 ${report.summary.modify}，删除 ${report.summary.delete}\n- 显式确认项：${report.summary.confirmationRequired}\n`;
  const temporary = `${baselinePath}.tmp`;
  await Promise.all(Object.entries(artifacts).map(([name, content]) => writeFile(path.join(productDirectory, name), content, "utf8")));
  await writeFile(changeLogPath, changeLog, "utf8");
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporary, baselinePath);
  await writeFile(path.join(requirementDirectory, "11-change-impact", "acceptance.json"), `${JSON.stringify({ schemaVersion: "1.1", status: "accepted", acceptedAt: next.baseline.updatedAt, previousBaseline: { sequence: current.baseline.sequence, hash: current.baseline.hash }, baseline: { sequence: next.baseline.sequence, hash: next.baseline.hash }, confirmedConflicts: report.conflicts.filter((item) => item.severity === "CONFIRMATION_REQUIRED") }, null, 2)}\n`, "utf8");
  return { previousSequence: current.baseline.sequence, sequence: next.baseline.sequence, baselinePath, snapshotPath, updatedArtifacts: [...Object.keys(artifacts), "change-log.md"] };
}
