import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CrossModuleImpactReport, ModuleImpactItem } from "../cross-module-impact/types.js";
import { evaluateSolutionGate } from "../solution-options/service.js";
import type { SolutionDecision } from "../solution-options/types.js";
import type { DesignUnit, DesignUnitKind, DesignUnitPlan, DesignUnitTraceabilityReport } from "./types.js";

const hash = (value: unknown): string => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const planDirectory = (requirementDirectory: string): string => path.join(requirementDirectory, "02-product-outline", "design-units");
const planPath = (requirementDirectory: string): string => path.join(planDirectory(requirementDirectory), "design-unit-plan.json");
export const designUnitMarker = (id: string): string => `[design-unit:${id}]`;

function slug(value: string): string {
  return value.replace(/^module\./, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
}

function expectedArtifacts(kind: DesignUnitKind): string[] {
  const common = ["01-requirement-analysis.md", "02-product-outline.md", "09-prd.md", "10-review.md"];
  if (kind === "workflow") return [...common, "03-product-architecture.md", "04-core-flow.md", "06-prototype/prototype.json"];
  if (kind === "page") return [...common, "05-page-structure.md", "06-prototype/prototype.json"];
  if (kind === "data-model" || kind === "interface" || kind === "migration") return [...common, "03-product-architecture.md"];
  if (kind === "permission" || kind === "configuration") return [...common, "03-product-architecture.md", "05-page-structure.md"];
  return common;
}

function kindsForImpact(item: ModuleImpactItem): DesignUnitKind[] {
  if (item.level === "REGRESSION") return ["regression"];
  const kinds = new Set<DesignUnitKind>(["capability"]);
  if (/permission/.test(item.moduleId) || item.dependencyTypes.includes("permission")) kinds.add("permission");
  if (/form|report/.test(item.moduleId) || item.dependencyTypes.includes("data")) kinds.add("data-model");
  if (/workflow/.test(item.moduleId)) kinds.add("workflow");
  if (["DIRECT", "INDIRECT"].includes(item.level)) kinds.add("page");
  if (item.dependencyTypes.includes("configuration")) kinds.add("configuration");
  if (item.dependencyTypes.includes("integration")) kinds.add("interface");
  if (item.dependencyTypes.includes("lifecycle")) kinds.add("migration");
  return [...kinds];
}

function buildUnits(report: CrossModuleImpactReport): DesignUnit[] {
  return report.impacts.flatMap((item) => kindsForImpact(item).map((kind): DesignUnit => ({
    id: `DU-${slug(item.moduleId)}-${slug(kind)}`,
    kind,
    name: `${item.moduleName}${kind === "capability" ? "能力变更" : kind === "regression" ? "回归验证" : `${kind}设计`}`,
    moduleId: item.moduleId,
    moduleName: item.moduleName,
    impactLevel: item.level,
    description: `${item.moduleName}在本次${item.level === "DIRECT" ? "直接" : item.level === "INDIRECT" ? "间接" : "回归"}影响中的${kind}设计单元。`,
    sourceReasons: item.reasons,
    expectedArtifacts: expectedArtifacts(kind),
    status: "planned",
  }))).sort((left, right) => left.id.localeCompare(right.id));
}

export async function generateDesignUnitPlan(requirementDirectory: string, report: CrossModuleImpactReport): Promise<{ plan: DesignUnitPlan; jsonPath: string; markdownPath: string }> {
  const gate = await evaluateSolutionGate(requirementDirectory);
  if (!gate.canProceed || !gate.decision) throw new Error(`设计单元生成被阻断：${gate.reason}`);
  const decision: SolutionDecision = gate.decision;
  if (decision.requirementFingerprint !== report.requirement.fingerprint || decision.impactReportHash !== hash(report) || decision.moduleCatalogVersion !== report.moduleCatalog.version) {
    throw new Error("设计单元生成被阻断：已选择方案与当前需求或影响报告不一致。");
  }
  const plan: DesignUnitPlan = {
    schemaVersion: "1.6", requirementFingerprint: report.requirement.fingerprint, impactReportHash: hash(report),
    solutionComparisonHash: decision.comparisonHash, selectedOptionId: decision.selectedOptionId, solutionScope: decision.scope,
    generatedAt: new Date().toISOString(), units: buildUnits(report),
  };
  const directory = planDirectory(requirementDirectory);
  await mkdir(directory, { recursive: true });
  const jsonPath = planPath(requirementDirectory);
  const markdownPath = path.join(directory, "design-unit-plan.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderDesignUnitPlan(plan), "utf8")]);
  return { plan, jsonPath, markdownPath };
}

export function renderDesignUnitPlan(plan: DesignUnitPlan): string {
  const rows = plan.units.map((unit) => `| ${designUnitMarker(unit.id)} | ${unit.kind} | ${unit.moduleName} | ${unit.impactLevel} | ${unit.expectedArtifacts.join("、")} |`).join("\n");
  return `# 复杂需求设计单元计划\n\n- 已选方案：${plan.selectedOptionId}\n- 实施范围：${plan.solutionScope}\n- 设计单元：${plan.units.length}\n\n| 稳定标识 | 类型 | 模块 | 影响 | 应覆盖成果物 |\n|---|---|---|---|---|\n${rows}\n\n> 所有正式成果物必须保留对应的 design-unit 标记，缺失引用将阻断设计检查。\n`;
}

export async function readDesignUnitPlan(requirementDirectory: string): Promise<DesignUnitPlan> {
  try { return JSON.parse(await readFile(planPath(requirementDirectory), "utf8")) as DesignUnitPlan; }
  catch (error) { throw new Error(`无法读取设计单元计划：${(error as Error).message}`); }
}

async function optionalText(file: string): Promise<string | undefined> {
  try { return await readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function validateDesignUnitTraceability(requirementDirectory: string, plan?: DesignUnitPlan): Promise<DesignUnitTraceabilityReport> {
  plan ??= await readDesignUnitPlan(requirementDirectory);
  const checks: DesignUnitTraceabilityReport["checks"] = [];
  for (const unit of plan.units) {
    for (const artifact of unit.expectedArtifacts) {
      const raw = await optionalText(path.join(requirementDirectory, artifact));
      checks.push({ unitId: unit.id, artifact, status: raw === undefined ? "MISSING_ARTIFACT" : raw.includes(`design-unit:${unit.id}`) ? "PASS" : "MISSING_REFERENCE" });
    }
  }
  const coveredReferenceCount = checks.filter((item) => item.status === "PASS").length;
  const missingArtifactCount = checks.filter((item) => item.status === "MISSING_ARTIFACT").length;
  const missingReferenceCount = checks.filter((item) => item.status === "MISSING_REFERENCE").length;
  return {
    schemaVersion: "1.6", valid: coveredReferenceCount === checks.length, planFingerprint: hash(plan), checks,
    summary: { unitCount: plan.units.length, expectedReferenceCount: checks.length, coveredReferenceCount, missingArtifactCount, missingReferenceCount },
  };
}

export function renderDesignUnitTraceability(report: DesignUnitTraceabilityReport): string {
  const rows = report.checks.map((item) => `| ${item.unitId} | ${item.artifact} | ${item.status} |`).join("\n");
  return `# 设计单元跨成果物追踪\n\n- 结论：${report.valid ? "PASS" : "FAIL"}\n- 设计单元：${report.summary.unitCount}\n- 覆盖：${report.summary.coveredReferenceCount}/${report.summary.expectedReferenceCount}\n- 缺失成果物：${report.summary.missingArtifactCount}\n- 缺失引用：${report.summary.missingReferenceCount}\n\n| 设计单元 | 成果物 | 状态 |\n|---|---|---|\n${rows}\n`;
}

export async function writeDesignUnitTraceability(requirementDirectory: string): Promise<{ report: DesignUnitTraceabilityReport; jsonPath: string; markdownPath: string }> {
  const report = await validateDesignUnitTraceability(requirementDirectory);
  const directory = path.join(requirementDirectory, "09-validation");
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "design-unit-traceability.json");
  const markdownPath = path.join(directory, "design-unit-traceability.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderDesignUnitTraceability(report), "utf8")]);
  return { report, jsonPath, markdownPath };
}
