import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CrossModuleImpactReport } from "../cross-module-impact/types.js";
import type { PlatformBoundaryPath } from "../platform-analysis/types.js";
import type { SolutionComparison, SolutionDecision, SolutionGateStatus, SolutionOption, SolutionOptionId } from "./types.js";

export const solutionDirectory = (requirementDirectory: string): string => path.join(requirementDirectory, "02-product-outline", "solution-options");
const comparisonPath = (requirementDirectory: string): string => path.join(solutionDirectory(requirementDirectory), "solution-comparison.json");
const decisionPath = (requirementDirectory: string): string => path.join(solutionDirectory(requirementDirectory), "solution-decision.json");
const hash = (value: unknown): string => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

function option(id: SolutionOptionId, name: string, pathValue: PlatformBoundaryPath, report: CrossModuleImpactReport, recommended: boolean): SolutionOption {
  const scope = report.impacts.map((item) => `${item.moduleName}（${item.level}）`);
  const definitions: Record<SolutionOptionId, Omit<SolutionOption, "id" | "name" | "path" | "scope" | "recommended">> = {
    configuration: {
      description: "优先组合现有配置能力，不改变平台公共模型。",
      tradeoffs: { universality: 3, reuseValue: 3, implementationCost: 1, impactRisk: 1, maintenanceCost: 2 },
      benefits: ["实现成本较低", "对存量功能影响较小"], risks: ["可能无法覆盖统一数据权限规则", "容易形成模块间配置差异"], prerequisites: ["确认现有模块均已提供所需配置点"],
    },
    "platform-enhancement": {
      description: "在基础平台建设统一公共能力，并由相关模块共同复用。",
      tradeoffs: { universality: 5, reuseValue: 5, implementationCost: 4, impactRisk: 4, maintenanceCost: 3 },
      benefits: ["统一跨模块规则", "后续项目可直接复用", "减少重复定制"], risks: ["影响范围较大", "需要完整兼容和回归方案"], prerequisites: ["确认公共模型、权限接口和版本范围", "制定存量兼容策略"],
    },
    "product-extension": {
      description: "通过产品扩展实现领域能力，保持核心平台相对稳定。",
      tradeoffs: { universality: 4, reuseValue: 4, implementationCost: 3, impactRisk: 2, maintenanceCost: 3 },
      benefits: ["隔离核心平台变更", "可在同类产品中复用"], risks: ["扩展和核心模块边界可能复杂", "依赖扩展点完整性"], prerequisites: ["相关模块提供稳定扩展契约"],
    },
    "project-customization": {
      description: "仅在具体项目范围内实现，不进入平台公共能力。",
      tradeoffs: { universality: 1, reuseValue: 1, implementationCost: 2, impactRisk: 2, maintenanceCost: 5 },
      benefits: ["交付范围可控", "无需立即调整平台公共模型"], risks: ["后续项目重复建设", "形成项目间规则差异"], prerequisites: ["确认需求仅服务单一项目或客户"],
    },
    "architecture-assessment": {
      description: "先完成架构、存量数据和兼容性专项评估，再决定实施路径。",
      tradeoffs: { universality: 4, reuseValue: 4, implementationCost: 3, impactRisk: 5, maintenanceCost: 3 },
      benefits: ["避免在关键架构问题未明确时直接实施", "可提前识别迁移和兼容风险"], risks: ["延长方案确认周期"], prerequisites: ["补充数据规模、历史版本和回滚要求"],
    },
  };
  return { id, name, path: pathValue, scope, recommended, ...definitions[id] };
}

export function buildSolutionComparison(report: CrossModuleImpactReport): SolutionComparison {
  const recommendationMap: Record<PlatformBoundaryPath, SolutionOptionId> = {
    configuration: "configuration", "platform-enhancement": "platform-enhancement", "platform-capability": "platform-enhancement",
    "project-customization": "project-customization", "project-validation": "product-extension", "architecture-assessment": "architecture-assessment",
  };
  const recommendedOptionId = recommendationMap[report.boundary.recommendation];
  const optionIds: SolutionOptionId[] = recommendedOptionId === "architecture-assessment"
    ? ["architecture-assessment", "platform-enhancement", "product-extension"]
    : ["configuration", "platform-enhancement", "product-extension", "project-customization"];
  const names: Record<SolutionOptionId, string> = { configuration: "现有能力组合", "platform-enhancement": "平台公共能力增强", "product-extension": "产品扩展", "project-customization": "项目定制", "architecture-assessment": "架构专项评估" };
  const paths: Record<SolutionOptionId, PlatformBoundaryPath> = { configuration: "configuration", "platform-enhancement": "platform-enhancement", "product-extension": "project-validation", "project-customization": "project-customization", "architecture-assessment": "architecture-assessment" };
  return {
    schemaVersion: "1.6", status: "pending-product-manager-selection", impactReportHash: hash(report), requirementFingerprint: report.requirement.fingerprint,
    moduleCatalogVersion: report.moduleCatalog.version, generatedAt: new Date().toISOString(),
    options: optionIds.map((id) => option(id, names[id], paths[id], report, id === recommendedOptionId)),
    recommendedOptionId, recommendationBasis: report.boundary.basis,
    gate: { canProceed: false, reason: "必须由产品经理明确选择一个实施方案后才能继续正式设计。" },
  };
}

export function renderSolutionComparison(comparison: SolutionComparison): string {
  const rows = comparison.options.map((item) => `| ${item.name}${item.recommended ? "（建议）" : ""} | ${item.tradeoffs.universality} | ${item.tradeoffs.reuseValue} | ${item.tradeoffs.implementationCost} | ${item.tradeoffs.impactRisk} | ${item.tradeoffs.maintenanceCost} |`).join("\n");
  return `# 实施方案比较\n\n- 状态：待产品经理选择\n- 建议方案：${comparison.options.find((item) => item.id === comparison.recommendedOptionId)?.name}\n- 当前门禁：禁止继续正式设计\n\n> 评分范围为1—5。成本和风险分数越高，表示投入或风险越大。\n\n| 方案 | 通用性 | 复用价值 | 实现成本 | 影响风险 | 维护成本 |\n|---|---:|---:|---:|---:|---:|\n${rows}\n\n## 建议依据\n\n${comparison.recommendationBasis.map((item) => `- ${item}`).join("\n")}\n\n## 方案详情\n\n${comparison.options.map((item) => `### ${item.name}\n\n${item.description}\n\n- 收益：${item.benefits.join("；")}\n- 风险：${item.risks.join("；")}\n- 前提：${item.prerequisites.join("；")}`).join("\n\n")}\n`;
}

export async function writeSolutionComparison(requirementDirectory: string, report: CrossModuleImpactReport): Promise<{ comparison: SolutionComparison; jsonPath: string; markdownPath: string }> {
  const comparison = buildSolutionComparison(report);
  const directory = solutionDirectory(requirementDirectory);
  await mkdir(directory, { recursive: true });
  const jsonPath = comparisonPath(requirementDirectory);
  const markdownPath = path.join(directory, "solution-comparison.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderSolutionComparison(comparison), "utf8")]);
  return { comparison, jsonPath, markdownPath };
}

export async function readSolutionComparison(requirementDirectory: string): Promise<SolutionComparison> {
  try { return JSON.parse(await readFile(comparisonPath(requirementDirectory), "utf8")) as SolutionComparison; }
  catch (error) { throw new Error(`无法读取实施方案比较：${(error as Error).message}`); }
}

export async function selectSolution(requirementDirectory: string, selectedOptionId: SolutionOptionId, scope: string, note?: string): Promise<{ decision: SolutionDecision; path: string }> {
  const comparison = await readSolutionComparison(requirementDirectory);
  if (!comparison.options.some((item) => item.id === selectedOptionId)) throw new Error(`当前方案比较中不存在选项：${selectedOptionId}`);
  if (!scope.trim()) throw new Error("方案选择必须填写本次实施范围。");
  const decision: SolutionDecision = {
    schemaVersion: "1.6", status: "selected", comparisonHash: hash(comparison), impactReportHash: comparison.impactReportHash,
    requirementFingerprint: comparison.requirementFingerprint, moduleCatalogVersion: comparison.moduleCatalogVersion,
    selectedOptionId, scope: scope.trim(), note: note?.trim() || undefined, selectedAt: new Date().toISOString(), selectedBy: "product-manager",
  };
  const target = decisionPath(requirementDirectory);
  await writeFile(target, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
  return { decision, path: target };
}

export async function evaluateSolutionGate(requirementDirectory: string): Promise<SolutionGateStatus> {
  const comparison = await readSolutionComparison(requirementDirectory);
  let decision: SolutionDecision;
  try { decision = JSON.parse(await readFile(decisionPath(requirementDirectory), "utf8")) as SolutionDecision; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "WAITING_SELECTION", canProceed: false, reason: "实施方案已生成，等待产品经理选择。" };
    throw error;
  }
  const valid = decision.schemaVersion === "1.6" && decision.status === "selected" && decision.comparisonHash === hash(comparison)
    && decision.impactReportHash === comparison.impactReportHash && decision.requirementFingerprint === comparison.requirementFingerprint
    && decision.moduleCatalogVersion === comparison.moduleCatalogVersion && comparison.options.some((item) => item.id === decision.selectedOptionId);
  return valid
    ? { status: "SELECTED", canProceed: true, reason: "产品经理已选择有效实施方案。", decision }
    : { status: "INVALIDATED", canProceed: false, reason: "需求、影响分析或方案比较已变化，原方案选择失效。" };
}
