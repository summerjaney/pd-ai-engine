import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RequirementInput } from "../domain/types.js";
import type { CrossModuleImpactReport, ModuleImpactItem } from "../cross-module-impact/types.js";
import { buildDesignUnits, readDesignUnitPlan } from "../design-units/service.js";
import type { DesignUnitPlan } from "../design-units/types.js";
import type { IncrementalDesignUnitPlan, RequirementChangeReport, RequirementDesignSnapshot } from "./types.js";

const directory = (requirementDirectory: string): string => path.join(requirementDirectory, "11-change-impact", "requirement-change");
const snapshotPath = (requirementDirectory: string): string => path.join(directory(requirementDirectory), "design-snapshot.json");
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

async function optionalSnapshot(requirementDirectory: string): Promise<RequirementDesignSnapshot | undefined> {
  try { return JSON.parse(await readFile(snapshotPath(requirementDirectory), "utf8")) as RequirementDesignSnapshot; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function captureRequirementDesignSnapshot(requirementDirectory: string, input: RequirementInput, impactReport: CrossModuleImpactReport, designUnitPlan?: DesignUnitPlan): Promise<{ snapshot: RequirementDesignSnapshot; path: string }> {
  designUnitPlan ??= await readDesignUnitPlan(requirementDirectory);
  if (designUnitPlan.requirementFingerprint !== impactReport.requirement.fingerprint || input.title !== impactReport.requirement.title) throw new Error("快照创建失败：需求、影响报告和设计单元计划不一致。");
  const previous = await optionalSnapshot(requirementDirectory);
  const snapshot: RequirementDesignSnapshot = {
    schemaVersion: "1.6", sequence: (previous?.sequence ?? 0) + 1, capturedAt: new Date().toISOString(),
    requirement: { title: input.title, fingerprint: impactReport.requirement.fingerprint, contentHash: hash(input.content) },
    impactReport, designUnitPlan,
  };
  const target = snapshotPath(requirementDirectory);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { snapshot, path: target };
}

function comparableImpact(item: ModuleImpactItem): unknown {
  return { moduleId: item.moduleId, level: item.level, reasons: [...item.reasons].sort(), dependencyTypes: [...item.dependencyTypes].sort() };
}

export async function detectRequirementChange(requirementDirectory: string, input: RequirementInput, currentImpact: CrossModuleImpactReport): Promise<RequirementChangeReport> {
  const snapshot = await optionalSnapshot(requirementDirectory);
  if (!snapshot) throw new Error("尚未建立需求设计快照，请先执行 change snapshot。");
  const previousByModule = new Map(snapshot.impactReport.impacts.map((item) => [item.moduleId, item]));
  const currentByModule = new Map(currentImpact.impacts.map((item) => [item.moduleId, item]));
  const moduleIds = new Set([...previousByModule.keys(), ...currentByModule.keys()]);
  const moduleChanges: RequirementChangeReport["moduleChanges"] = [];
  for (const moduleId of [...moduleIds].sort()) {
    const previous = previousByModule.get(moduleId);
    const current = currentByModule.get(moduleId);
    if (!previous && current) moduleChanges.push({ moduleId, moduleName: current.moduleName, operation: "ADDED" });
    else if (previous && !current) moduleChanges.push({ moduleId, moduleName: previous.moduleName, operation: "REMOVED" });
    else if (previous && current && JSON.stringify(comparableImpact(previous)) !== JSON.stringify(comparableImpact(current))) moduleChanges.push({ moduleId, moduleName: current.moduleName, operation: "MODIFIED" });
  }
  const requirementChanged = snapshot.requirement.contentHash !== hash(input.content) || snapshot.requirement.fingerprint !== currentImpact.requirement.fingerprint;
  const affectedModuleIds = moduleChanges.map((item) => item.moduleId);
  const affectedSet = new Set(affectedModuleIds);
  const preservedUnits = snapshot.designUnitPlan.units.filter((unit) => !affectedSet.has(unit.moduleId));
  const newUnits = buildDesignUnits(currentImpact);
  const recomputedUnits = newUnits.filter((unit) => affectedSet.has(unit.moduleId));
  const currentIds = new Set(newUnits.map((unit) => unit.id));
  const removedUnitIds = snapshot.designUnitPlan.units.filter((unit) => affectedSet.has(unit.moduleId) && !currentIds.has(unit.id)).map((unit) => unit.id);
  const changed = requirementChanged || moduleChanges.length > 0;
  const incrementalPlan: IncrementalDesignUnitPlan = {
    schemaVersion: "1.6", status: changed ? "pending-solution-reconfirmation" : "unchanged", previousSnapshotSequence: snapshot.sequence,
    requirementFingerprint: currentImpact.requirement.fingerprint, preservedUnits, recomputedUnits, removedUnitIds,
    units: [...preservedUnits, ...recomputedUnits].sort((left, right) => left.id.localeCompare(right.id)),
  };
  const invalidatedConfirmations = changed ? ["solution-decision", "design-unit-plan", "design-unit-traceability", "solution-design-confirmation", "prototype-confirmation", "prd-confirmation"] : [];
  return {
    schemaVersion: "1.6", status: changed ? "CHANGE_DETECTED" : "NO_CHANGE", baselineSequence: snapshot.sequence,
    previousRequirementFingerprint: snapshot.requirement.fingerprint, currentRequirementFingerprint: currentImpact.requirement.fingerprint,
    moduleChanges, affectedModuleIds, preservedUnitIds: preservedUnits.map((unit) => unit.id), recomputedUnitIds: recomputedUnits.map((unit) => unit.id), removedUnitIds,
    invalidatedConfirmations, incrementalPlan,
    summary: {
      addedModules: moduleChanges.filter((item) => item.operation === "ADDED").length,
      modifiedModules: moduleChanges.filter((item) => item.operation === "MODIFIED").length,
      removedModules: moduleChanges.filter((item) => item.operation === "REMOVED").length,
      affectedUnits: recomputedUnits.length + removedUnitIds.length,
      preservedUnits: preservedUnits.length,
    },
  };
}

export function renderRequirementChangeReport(report: RequirementChangeReport): string {
  const rows = report.moduleChanges.length ? report.moduleChanges.map((item) => `| ${item.moduleName} | ${item.operation} |`).join("\n") : "| 无 | - |";
  return `# 复杂需求增量变更分析\n\n- 状态：${report.status}\n- 设计快照：#${report.baselineSequence}\n- 影响设计单元：${report.summary.affectedUnits}\n- 保留设计单元：${report.summary.preservedUnits}\n- 增量计划：${report.incrementalPlan.status}\n\n## 模块变化\n\n| 模块 | 操作 |\n|---|---|\n${rows}\n\n## 确认失效\n\n${report.invalidatedConfirmations.length ? report.invalidatedConfirmations.map((item) => `- ${item}`).join("\n") : "- 无"}\n\n## 设计单元处理\n\n- 保留：${report.preservedUnitIds.join("、") || "无"}\n- 重算：${report.recomputedUnitIds.join("、") || "无"}\n- 移除：${report.removedUnitIds.join("、") || "无"}\n\n> 变更后必须重新确认实施方案，才能把增量计划升级为新的正式设计单元计划。\n`;
}

export async function writeRequirementChangeReport(requirementDirectory: string, input: RequirementInput, impactReport: CrossModuleImpactReport): Promise<{ report: RequirementChangeReport; jsonPath: string; markdownPath: string; incrementalPlanPath: string }> {
  const report = await detectRequirementChange(requirementDirectory, input, impactReport);
  const targetDirectory = directory(requirementDirectory);
  await mkdir(targetDirectory, { recursive: true });
  const jsonPath = path.join(targetDirectory, "requirement-change-report.json");
  const markdownPath = path.join(targetDirectory, "requirement-change-report.md");
  const incrementalPlanPath = path.join(targetDirectory, "incremental-design-unit-plan.json");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderRequirementChangeReport(report), "utf8"),
    writeFile(incrementalPlanPath, `${JSON.stringify(report.incrementalPlan, null, 2)}\n`, "utf8"),
  ]);
  return { report, jsonPath, markdownPath, incrementalPlanPath };
}

export async function readRequirementChangeReport(requirementDirectory: string): Promise<RequirementChangeReport> {
  try { return JSON.parse(await readFile(path.join(directory(requirementDirectory), "requirement-change-report.json"), "utf8")) as RequirementChangeReport; }
  catch (error) { throw new Error(`无法读取需求变更报告：${(error as Error).message}`); }
}
