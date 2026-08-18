import { createHash } from "node:crypto";
import type { RequirementInput } from "../domain/types.js";
import type { PlatformBoundaryPath } from "../platform-analysis/types.js";
import type { PlatformModule, PlatformModuleCatalog, PlatformModuleDependencyType } from "../platform-modules/types.js";
import type { CrossModuleImpactReport, ModuleImpactItem, ModuleImpactLevel } from "./types.js";

const BOUNDARY_SIGNALS = {
  architecture: /底层模型|底层架构|历史数据迁移|模型迁移|向后兼容|版本回滚|存量数据迁移/,
  project: /仅本项目|客户定制|项目专用|单一客户|一次性需求/,
  platform: /基础平台|通用能力|多个项目|统一能力|平台能力|全局配置/,
};

function terms(value: string): Set<string> {
  const normalized = value.toLowerCase();
  const result = new Set(normalized.match(/[a-z0-9][a-z0-9_-]+|[\p{Script=Han}]{2,}/gu) ?? []);
  for (const chunk of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let size = 2; size <= Math.min(6, chunk.length); size++) {
      for (let index = 0; index <= chunk.length - size; index++) result.add(chunk.slice(index, index + size));
    }
  }
  return result;
}

function moduleScore(module: PlatformModule, query: Set<string>): { score: number; reasons: string[] } {
  const fields = [module.name, ...module.responsibilities, ...module.coreObjects, ...module.extensionPoints];
  const reasons: string[] = [];
  let score = 0;
  for (const field of fields) {
    const matches = [...terms(field)].filter((term) => query.has(term));
    if (!matches.length) continue;
    score += Math.max(...matches.map((term) => term.length >= 4 ? 3 : 1));
    reasons.push(`需求命中模块知识“${field}”`);
  }
  return { score, reasons: [...new Set(reasons)].slice(0, 4) };
}

function rank(level: ModuleImpactLevel): number {
  return level === "DIRECT" ? 0 : level === "INDIRECT" ? 1 : 2;
}

function boundary(report: Omit<CrossModuleImpactReport, "boundary" | "unknowns">, content: string): CrossModuleImpactReport["boundary"] {
  const direct = report.impacts.filter((item) => item.level === "DIRECT");
  let recommendation: PlatformBoundaryPath;
  let confidence: "low" | "medium" | "high";
  let basis: string[];
  let alternatives: PlatformBoundaryPath[];
  if (BOUNDARY_SIGNALS.architecture.test(content)) {
    recommendation = "architecture-assessment";
    confidence = "high";
    basis = ["需求涉及底层模型、兼容或历史数据迁移。", "必须先评估存量数据和版本升级策略。"];
    alternatives = ["platform-enhancement", "project-validation"];
  } else if (BOUNDARY_SIGNALS.project.test(content) && !BOUNDARY_SIGNALS.platform.test(content)) {
    recommendation = "project-customization";
    confidence = "medium";
    basis = ["需求明确包含单一项目或客户专用信号。", "尚无证据证明该能力具有跨项目复用价值。"];
    alternatives = ["project-validation", "platform-capability"];
  } else if (direct.length >= 2 || report.summary.total >= 3 || BOUNDARY_SIGNALS.platform.test(content)) {
    recommendation = "platform-enhancement";
    confidence = direct.length >= 3 ? "high" : "medium";
    basis = [`需求直接影响 ${direct.length} 个模块、总计涉及 ${report.summary.total} 个模块。`, "跨模块统一规则应优先在平台层形成一致能力。"];
    alternatives = ["configuration", "platform-capability", "project-validation"];
  } else {
    recommendation = "project-validation";
    confidence = "low";
    basis = ["当前只识别到有限模块影响，平台化证据不足。", "需要确认是否已有配置能力及是否存在重复项目需求。"];
    alternatives = ["configuration", "platform-enhancement", "project-customization"];
  }
  return { recommendation, confidence, basis, alternatives, status: "pending-product-manager-confirmation", requiresHumanConfirmation: true };
}

export function analyzeCrossModuleImpact(input: RequirementInput, catalog: PlatformModuleCatalog): CrossModuleImpactReport {
  const query = terms(`${input.title}\n${input.content}`);
  const impacts = new Map<string, ModuleImpactItem>();
  for (const module of catalog.modules) {
    const matched = moduleScore(module, query);
    if (matched.score > 0) impacts.set(module.id, { moduleId: module.id, moduleName: module.name, level: "DIRECT", score: matched.score, reasons: matched.reasons, dependencyTypes: [] });
  }

  const directIds = new Set(impacts.keys());
  const visitDependencies = (moduleId: string): void => {
    const module = catalog.byId.get(moduleId);
    if (!module) return;
    for (const dependency of module.dependencies) {
      const existing = impacts.get(dependency.moduleId);
      if (!existing) {
        const target = catalog.byId.get(dependency.moduleId)!;
        impacts.set(target.id, { moduleId: target.id, moduleName: target.name, level: "INDIRECT", score: 0, reasons: [`${module.name}依赖该模块：${dependency.description}`], dependencyTypes: [dependency.type] });
        visitDependencies(target.id);
      } else if (existing.level !== "DIRECT") {
        existing.reasons.push(`${module.name}依赖该模块：${dependency.description}`);
        existing.dependencyTypes = [...new Set([...existing.dependencyTypes, dependency.type])];
      }
    }
  };
  for (const moduleId of directIds) visitDependencies(moduleId);

  for (const module of catalog.modules) {
    if (impacts.has(module.id)) continue;
    const downstream = module.dependencies.filter((dependency) => directIds.has(dependency.moduleId));
    if (!downstream.length) continue;
    impacts.set(module.id, {
      moduleId: module.id, moduleName: module.name, level: "REGRESSION", score: 0,
      reasons: downstream.map((dependency) => `其依赖模块发生变化，需要回归：${dependency.description}`),
      dependencyTypes: [...new Set(downstream.map((dependency) => dependency.type))],
    });
  }

  const ordered = [...impacts.values()].sort((left, right) => rank(left.level) - rank(right.level) || right.score - left.score || left.moduleId.localeCompare(right.moduleId));
  const summary = {
    direct: ordered.filter((item) => item.level === "DIRECT").length,
    indirect: ordered.filter((item) => item.level === "INDIRECT").length,
    regression: ordered.filter((item) => item.level === "REGRESSION").length,
    total: ordered.length,
  };
  const dependencyEdges = catalog.modules.flatMap((module) => module.dependencies.filter((item) => impacts.has(module.id) && impacts.has(item.moduleId)).map((item) => ({ from: module.id, to: item.moduleId, type: item.type, reason: item.description })));
  const base = {
    schemaVersion: "1.6" as const,
    requirement: { title: input.title, fingerprint: createHash("sha256").update(input.content).digest("hex") },
    moduleCatalog: { productId: catalog.productId, version: catalog.version }, impacts: ordered, dependencyEdges, summary,
  };
  return {
    ...base,
    boundary: boundary(base, input.content),
    unknowns: ["现有配置是否已经覆盖全部数据范围", "存量数据和历史配置是否需要迁移", "各模块是否使用统一权限接口", "移动端和开放接口是否需要同步生效", "本次需求纳入的产品版本范围"],
  };
}

export function renderCrossModuleImpact(report: CrossModuleImpactReport): string {
  const rows = report.impacts.length ? report.impacts.map((item) => `| ${item.moduleName} | ${item.level} | ${item.reasons.join("；")} | ${item.dependencyTypes.join("、") || "-"} |`).join("\n") : "| 未识别 | - | 需要补充需求和模块资料 | - |";
  return `# 跨模块影响分析\n\n- 需求：${report.requirement.title}\n- 模块目录：${report.moduleCatalog.productId}@${report.moduleCatalog.version}\n- 直接/间接/回归：${report.summary.direct}/${report.summary.indirect}/${report.summary.regression}\n- 分析状态：待产品经理确认\n\n## 模块影响\n\n| 模块 | 影响级别 | 判断依据 | 依赖类型 |\n|---|---|---|---|\n${rows}\n\n## 平台化边界建议\n\n- 建议：${report.boundary.recommendation}\n- 置信度：${report.boundary.confidence}\n- 备选：${report.boundary.alternatives.join("、")}\n- 必须人工确认：是\n\n${report.boundary.basis.map((item) => `- ${item}`).join("\n")}\n\n## 待确认项\n\n${report.unknowns.map((item) => `- ${item}`).join("\n")}\n\n> 本报告只提供分析建议，不替代产品经理对平台边界、版本范围和兼容策略的最终决策。\n`;
}

export function renderCrossModuleMermaid(report: CrossModuleImpactReport): string {
  const ids = new Map(report.impacts.map((item, index) => [item.moduleId, `M${index + 1}`]));
  const lines = ["flowchart TD", ...report.impacts.map((item) => `  ${ids.get(item.moduleId)}[\"${item.moduleName} (${item.level})\"]`)];
  for (const edge of report.dependencyEdges) lines.push(`  ${ids.get(edge.from)} -->|${edge.type}| ${ids.get(edge.to)}`);
  return `${lines.join("\n")}\n`;
}
