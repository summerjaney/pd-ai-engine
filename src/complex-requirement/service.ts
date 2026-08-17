import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RequirementInput } from "../domain/types.js";
import { analyzeCrossModuleImpact, renderCrossModuleImpact, renderCrossModuleMermaid } from "../cross-module-impact/service.js";
import type { CrossModuleImpactReport } from "../cross-module-impact/types.js";
import { applyDesignUnitReferences, generateDesignUnitPlan, writeDesignUnitTraceability } from "../design-units/service.js";
import { captureRequirementDesignSnapshot } from "../incremental-change/service.js";
import { PlatformModuleService } from "../platform-modules/service.js";
import { evaluateSolutionGate, readSolutionComparison, writeSolutionComparison } from "../solution-options/service.js";

export interface ComplexRequirementAcceptanceReport {
  schemaVersion: "1.6";
  status: "PASS" | "WAITING_SOLUTION_SELECTION" | "FAIL";
  requirement: { title: string; fingerprint: string };
  moduleImpact: { direct: number; indirect: number; regression: number; total: number };
  solution: { status: string; selectedOptionId?: string };
  designUnits: { count: number; referenceCount: number; traceability: "PASS" | "FAIL" };
  snapshotSequence?: number;
  reservedManualValidation: string[];
}

const impactDirectory = (requirementDirectory: string): string => path.join(requirementDirectory, "00-platform-analysis", "cross-module-impact");
const impactPath = (requirementDirectory: string): string => path.join(impactDirectory(requirementDirectory), "module-impact-report.json");

export async function prepareComplexRequirement(requirementDirectory: string, input: RequirementInput, moduleDirectory = path.resolve("knowledge/platform/modules")): Promise<{ impact: CrossModuleImpactReport; status: "WAITING_SOLUTION_SELECTION" | "SOLUTION_SELECTED"; comparisonPath: string }> {
  const catalog = await new PlatformModuleService().load(moduleDirectory);
  const impact = analyzeCrossModuleImpact(input, catalog);
  const targetDirectory = impactDirectory(requirementDirectory);
  await mkdir(targetDirectory, { recursive: true });
  await Promise.all([
    writeFile(impactPath(requirementDirectory), `${JSON.stringify(impact, null, 2)}\n`, "utf8"),
    writeFile(path.join(targetDirectory, "module-impact-report.md"), renderCrossModuleImpact(impact), "utf8"),
    writeFile(path.join(targetDirectory, "dependency-graph.mmd"), renderCrossModuleMermaid(impact), "utf8"),
  ]);
  let preserveExisting = false;
  try {
    const comparison = await readSolutionComparison(requirementDirectory);
    preserveExisting = comparison.impactReportHash === createHash("sha256").update(JSON.stringify(impact)).digest("hex")
      && comparison.requirementFingerprint === impact.requirement.fingerprint && comparison.moduleCatalogVersion === impact.moduleCatalog.version;
  } catch {}
  const comparison = preserveExisting ? await readSolutionComparison(requirementDirectory) : (await writeSolutionComparison(requirementDirectory, impact)).comparison;
  const gate = await evaluateSolutionGate(requirementDirectory);
  return { impact, status: gate.canProceed ? "SOLUTION_SELECTED" : "WAITING_SOLUTION_SELECTION", comparisonPath: path.join(requirementDirectory, "02-product-outline", "solution-options", "solution-comparison.md") };
}

export async function readComplexImpact(requirementDirectory: string): Promise<CrossModuleImpactReport> {
  try { return JSON.parse(await readFile(impactPath(requirementDirectory), "utf8")) as CrossModuleImpactReport; }
  catch (error) { throw new Error(`无法读取跨模块影响报告：${(error as Error).message}`); }
}

export async function finalizeComplexRequirement(requirementDirectory: string, input: RequirementInput): Promise<{ report: ComplexRequirementAcceptanceReport; jsonPath: string; markdownPath: string }> {
  const impact = await readComplexImpact(requirementDirectory);
  const gate = await evaluateSolutionGate(requirementDirectory);
  if (!gate.canProceed || !gate.decision) throw new Error(`复杂需求正式整合被阻断：${gate.reason}`);
  const { plan } = await generateDesignUnitPlan(requirementDirectory, impact);
  const applied = await applyDesignUnitReferences(requirementDirectory, plan);
  const traceability = await writeDesignUnitTraceability(requirementDirectory);
  const snapshot = traceability.report.valid ? await captureRequirementDesignSnapshot(requirementDirectory, input, impact, plan) : undefined;
  const report: ComplexRequirementAcceptanceReport = {
    schemaVersion: "1.6", status: traceability.report.valid ? "PASS" : "FAIL", requirement: impact.requirement,
    moduleImpact: impact.summary, solution: { status: gate.status, selectedOptionId: gate.decision.selectedOptionId },
    designUnits: { count: plan.units.length, referenceCount: applied.referenceCount, traceability: traceability.report.valid ? "PASS" : "FAIL" },
    snapshotSequence: snapshot?.snapshot.sequence,
    reservedManualValidation: ["真实OpenAI-compatible Provider生成质量", "MasterGo真实多页面画布", "私有公司资料下的产品专业性评审"],
  };
  const targetDirectory = path.join(requirementDirectory, "12-acceptance", "complex-requirement");
  await mkdir(targetDirectory, { recursive: true });
  const jsonPath = path.join(targetDirectory, "acceptance-report.json");
  const markdownPath = path.join(targetDirectory, "acceptance-report.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderComplexRequirementAcceptance(report), "utf8")]);
  return { report, jsonPath, markdownPath };
}

export function renderComplexRequirementAcceptance(report: ComplexRequirementAcceptanceReport): string {
  return `# 跨模块复杂需求验收报告\n\n- 结论：${report.status}\n- 需求：${report.requirement.title}\n- 直接/间接/回归模块：${report.moduleImpact.direct}/${report.moduleImpact.indirect}/${report.moduleImpact.regression}\n- 已选方案：${report.solution.selectedOptionId ?? "未选择"}\n- 设计单元：${report.designUnits.count}\n- 设计单元引用：${report.designUnits.referenceCount}\n- 跨成果物追踪：${report.designUnits.traceability}\n- 设计快照：${report.snapshotSequence ? `#${report.snapshotSequence}` : "未建立"}\n\n## 保留人工验收\n\n${report.reservedManualValidation.map((item) => `- ${item}`).join("\n")}\n`;
}
