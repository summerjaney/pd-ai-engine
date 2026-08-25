#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { MockStageExecutor } from "./execution/mock-executor.js";
import { LlmWorkflowExecutor } from "./execution/llm-workflow-executor.js";
import { loadLlmConfig } from "./llm/config.js";
import { MockLlmProvider } from "./llm/mock-provider.js";
import { OpenAiProvider } from "./llm/openai-provider.js";
import { ProductDesignWorkflow } from "./workflow/workflow.js";
import { prepareRequirementOutput } from "./output/requirement-output.js";
import { readEngineVersion } from "./version.js";
import { preparePrototypePush } from "./prototype-execution/execution-service.js";
import { loadMasterGoMcpConfig } from "./integrations/mastergo/config.js";
import { diagnoseMasterGo } from "./integrations/mastergo/doctor.js";
import { StdioMasterGoConnection } from "./integrations/mastergo/stdio-connection.js";
import { executeMasterGoPagePipeline } from "./integrations/mastergo/page-pipeline.js";
import { verifyMasterGoCanvas } from "./integrations/mastergo/verification.js";
import { generateAcceptanceReport, runDeliveryCheck } from "./planning/delivery-check.js";
import { generateManualDelivery, runManualCheck, updateManualDelivery } from "./manual/service.js";
import { packageDelivery } from "./delivery/package.js";
import { prepareDocumentExport } from "./document/service.js";
import { buildFormalDelivery } from "./delivery/formal-package.js";
import { validateFormalDelivery } from "./delivery/formal-validator.js";
import type { DocumentFormat } from "./document/types.js";
import { loadPaeConfig } from "./config/loader.js";
import { diagnosePae } from "./diagnostics/doctor.js";
import { runReleaseQualityGate } from "./delivery/quality-gate.js";
import { acceptProductBaseline, establishInitialProductBaseline, loadProductBaseline } from "./product-baseline/service.js";
import { composeExtensionContext, loadExtension } from "./extensions/service.js";
import { loadExtensionWorkspace } from "./extensions/workspace.js";
import { confirmPlatformDecision } from "./platform-analysis/confirmation.js";
import type { PlatformBoundaryPath } from "./platform-analysis/types.js";
import { acceptKnowledgeFeedback } from "./knowledge-feedback/service.js";
import { confirmDesignGate, writeRealRequirementLoopReport } from "./real-requirement-loop/service.js";
import { addRequirementSource, readRequirementSourceIndex } from "./requirement-sources/service.js";
import type { RequirementSourceSensitivity, RequirementSourceType } from "./requirement-sources/types.js";
import { runDesignReview } from "./design-review/service.js";
import { PlatformKnowledgeService } from "./platform-knowledge/service.js";
import { assessCapabilityGap, renderCapabilityGapAssessment } from "./platform-knowledge/assessment.js";
import { acceptPlatformKnowledgeFeedback, extractPlatformKnowledgeFeedback, readPlatformKnowledgeFeedback, renderPlatformKnowledgeFeedback } from "./platform-knowledge/feedback.js";
import { ProductSourceService } from "./source-material/service.js";
import { PRODUCT_SOURCE_SENSITIVITIES, PRODUCT_SOURCE_TYPES } from "./source-material/types.js";
import type { MaterialKnowledgeDerivation, ProductSourceSensitivity, ProductSourceType } from "./source-material/types.js";
import { compareMaterialCandidates, deriveMaterialKnowledge, writeMaterialComparison } from "./source-material/derivation.js";
import { prepareMaterialPromotionPackage, promoteMaterialPackage } from "./source-material/promotion.js";
import { LlmMaterialKnowledgeExtractor } from "./source-material/extractor.js";
import { PlatformModuleService } from "./platform-modules/service.js";
import { analyzeCrossModuleImpact, renderCrossModuleImpact, renderCrossModuleMermaid } from "./cross-module-impact/service.js";
import { evaluateSolutionGate, readSolutionComparison, selectSolution, writeSolutionComparison } from "./solution-options/service.js";
import type { SolutionOptionId } from "./solution-options/types.js";
import { generateDesignUnitPlan, writeDesignUnitTraceability } from "./design-units/service.js";
import { captureRequirementDesignSnapshot, readRequirementChangeReport, writeRequirementChangeReport } from "./incremental-change/service.js";
import { finalizeComplexRequirement, prepareComplexRequirement } from "./complex-requirement/service.js";
import { analyzePortfolioRelationships, assessRequirementPortfolio, buildRequirementPortfolio } from "./release-portfolio/service.js";
import { generateReleaseOptions, readReleaseOptions, selectReleaseScope } from "./release-planning/service.js";
import type { ReleaseOptionId } from "./release-planning/types.js";
import { detectReleaseChanges, establishReleaseBaseline, readReleaseStatus } from "./release-planning/baseline.js";
import { finalizeReleasePlanning } from "./release-planning/delivery.js";
import { analyzeCompetitor, buildCompetitorBacklog, createRequirementFromCompetitor, prioritizeCompetitorCandidates, reviewCompetitorFeature } from "./competitor-analysis/service.js";
import type { CompetitorDecision } from "./competitor-analysis/types.js";
import { finalizeCompetitorDelivery } from "./competitor-analysis/delivery.js";
import { MarketEvidenceService } from "./market-evidence/service.js";
import { DiscoveryService } from "./discovery/service.js";
import type { DiscoveryKind } from "./discovery/types.js";
import { ValueChainService } from "./value-chain/service.js";
import { ReleaseObjectiveService } from "./release-objective/service.js";
import { ReleaseRetrospectiveService } from "./release-retrospective/service.js";
import { WorkspaceOrchestrator } from "./workspace-orchestrator/service.js";
import { finalizeMarketDelivery } from "./market-delivery/service.js";
import { AiProductPlanningService } from "./ai-product-planning/service.js";
import { AiRequirementDesignService } from "./ai-requirement-design/service.js";

const HELP_TEMPLATE = `PAE — Product Design AI Engine v{VERSION}

用法：
  pae requirement create <需求文件> --project <项目标识> --id <需求编号> --name <需求标识> [选项]
  pae deliver <需求文件> --project <项目标识> --id <需求编号> --name <需求标识> [选项]
  pae run <需求文件> [--out <输出目录>] [选项]
  pae prototype push <需求目录> --dry-run
  pae prototype push <需求目录> --write --confirm-write
  pae prototype push <需求目录> --write --confirm-write --resume
  pae prototype verify <需求目录> --pass --evidence <证据说明>
  pae delivery check <需求目录>
  pae delivery package <需求目录>
  pae delivery validate <需求目录>
  pae document export <需求目录> --format docx|pdf|all
  pae manual generate <需求目录>
  pae manual check <需求目录>
  pae manual update <需求目录>
  pae acceptance report <需求目录>
  pae mastergo doctor
  pae mastergo tools [--json <文件>]
  pae config show
  pae doctor
  pae validate <需求目录> --level release
  pae product status --project-dir <项目目录>
  pae product accept <需求目录>
  pae extension validate <扩展目录>
  pae extension compose <扩展目录> [更多扩展目录...]
  pae workspace validate <pae.workspace.json>
  pae platform confirm <需求目录> --decision <路径> --scope <范围> [--note <说明>]
  pae knowledge accept <需求目录> --workspace <pae.workspace.json> [--ids <候选ID逗号列表>]
  pae knowledge extract <需求目录>
  pae knowledge review <需求目录>
  pae knowledge accept <需求目录> --knowledge-dir <平台知识目录> [--ids <候选ID逗号列表>]
  pae knowledge validate [--knowledge-dir <平台知识目录>]
  pae knowledge list [--knowledge-dir <平台知识目录>]
  pae knowledge show <知识ID> [--knowledge-dir <平台知识目录>]
  pae knowledge search <关键词> [--knowledge-dir <平台知识目录>]
  pae capability analyze <需求文件> [--knowledge-dir <平台知识目录>] [--out <JSON文件>]
  pae capability gap <需求文件> [--knowledge-dir <平台知识目录>] [--out <Markdown文件>]
  pae module validate [--module-dir <平台模块目录>]
  pae module list [--module-dir <平台模块目录>]
  pae module show <模块ID> [--module-dir <平台模块目录>]
  pae module graph [--module-dir <平台模块目录>] [--out <Mermaid文件>]
  pae impact analyze <需求文件> [--module-dir <平台模块目录>] [--out <报告目录>]
  pae solution compare <影响分析JSON> --out <需求目录>
  pae solution list <需求目录>
  pae solution select <需求目录> --option <方案ID> --scope <范围> [--note <说明>]
  pae design-unit generate <需求目录> <影响分析JSON>
  pae design-unit check <需求目录>
  pae change snapshot <需求目录> <需求文件> <影响分析JSON>
  pae change detect <需求目录> <需求文件> <影响分析JSON>
  pae change status <需求目录>
  pae complex prepare <需求目录> <需求文件> [--module-dir <平台模块目录>]
  pae complex finalize <需求目录> <需求文件>
  pae portfolio build <项目目录>
  pae portfolio assess <项目目录>
  pae portfolio relate <项目目录>
  pae release plan <项目目录> --version <版本>
  pae release options <项目目录> --version <版本>
  pae release select <项目目录> --version <版本> --option <方案ID> [--include <需求ID列表>] [--defer <需求ID列表>]
  pae release baseline <项目目录> --version <版本>
  pae release detect <项目目录> --version <版本>
  pae release status <项目目录> --version <版本>
  pae release finalize <项目目录> --version <版本> --objective <版本目标>
  pae competitor analyze <竞品档案JSON> --baseline <平台能力JSON> --out <报告目录>
  pae competitor review <报告目录> --feature <功能ID> --decision adopt|adapt|reject|research --scope <适用范围>
  pae competitor create-requirement <报告目录> --feature <功能ID> --project-dir <项目目录> --id <需求编号> --name <需求标识>
  pae competitor prioritize <报告目录>
  pae competitor backlog <报告目录> --project-dir <项目目录>
  pae competitor finalize <报告目录> --project-dir <项目目录>
  pae evidence add <证据JSON> [--evidence-dir <目录>]
  pae evidence list [--evidence-dir <目录>]
  pae evidence show <证据ID> [--evidence-dir <目录>]
  pae evidence validate [--evidence-dir <目录>]
  pae evidence export-public [--evidence-dir <目录>] --out <JSON文件>
  pae discovery derive [--evidence-dir <目录>] [--discovery-dir <目录>]
  pae discovery review [--evidence-dir <目录>] [--discovery-dir <目录>] --kind problem|opportunity|value-hypothesis --id <ID> --action confirm|reject
  pae discovery status [--evidence-dir <目录>] [--discovery-dir <目录>]
  pae value link <需求目录> --discovery-dir <目录> --problem <ID> --opportunity <ID> --hypothesis <ID> --metric <指标JSON>
  pae value check <需求目录> --discovery-dir <目录>
  pae release objective set <项目目录> --version <版本> --input <目标JSON>
  pae release objective check <项目目录> --version <版本>
  pae release retrospect <项目目录> --version <版本> --input <实际结果JSON>
  pae release market-finalize <项目目录> --version <版本> --evidence-dir <目录> --discovery-dir <目录>
  pae workspace status|next|decisions|blockers|plan|continue|history <项目目录> [--dry-run] [--execute --confirm] [--run <运行ID>]
  pae ai plan <项目目录> --input <规划输入JSON>
  pae ai confirm <项目目录> --scenarios <场景ID列表> --scope <首期范围> [--note <说明>]
  pae ai create-requirement <项目目录> --input <设计输入JSON> --id <需求编号> --name <需求标识> [--product-version <版本>]
  pae material add <资料文件> --source-root <目录> --type <类型> --sensitivity <级别> --product <产品>
  pae material list --source-root <目录>
  pae material extract <资料ID> --source-root <目录>
  pae material derive <解析JSON> [--extractor rule|llm] [--out <目录>]
  pae material compare <候选JSON> --knowledge-dir <平台知识目录> [--out <目录>]
  pae material package <候选JSON> <比较JSON> <审核JSON> [--out <目录>]
  pae material promote <晋升包JSON> --knowledge-dir <平台知识目录>
  pae design status <需求目录>
  pae design confirm <需求目录> --gate requirement|solution|prd [--note <说明>]
  pae design check <需求目录>
  pae source add <需求目录> <来源文件> --type <类型> --sensitivity public|internal|confidential [选项]
  pae source list <需求目录>
  pae --help

示例：
  pae requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request
  pae deliver examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request
  pae run examples/b2b-requirement.md --out output/legacy-example --project hr-system --id REQ-001 --name leave-request
  pae prototype push output/hr-system/requirements/REQ-001-leave-request --dry-run
  pae mastergo doctor
  pae mastergo tools

选项：
  --project <标识>            项目唯一标识（requirement create 必填，run 可选）
  --project-name <名称>       项目显示名称，默认使用项目标识
  --id <需求编号>             需求唯一编号（requirement create 必填，run 可选）
  --name <需求标识>           需求标识名称（requirement create 必填，run 可选）
  --product-version <版本>   被设计产品版本，默认 0.1.0
  --revision <数字>          需求修订版本，默认 1
  --output-root <目录>       输出根目录，默认 output
  --out <目录>                输出目录（仅 run 命令，默认 output/latest）
  --provider <名称>          LLM Provider：mock（默认）或 openai
  --model <名称>             模型名称；openai 模式必填
  --knowledge-mode <模式>   知识模式：auto（默认）或 off（A/B 对照基线）
  --dry-run                 只生成 MasterGo 操作计划，不修改画布
  --write                   执行真实 MasterGo 页面写入
  --confirm-write           显式确认本次写入（必须与 --write 同时使用）
  --resume                  从上次失败页面继续，跳过已提交页面
  --pass                    将已人工核验的 MasterGo 画布回写为 PASS
  --evidence <说明>         人工画布验收证据说明（verify 必填）
  --page <页面ID>           仅验收指定 MasterGo 页面；省略时验收全部待验收页面
  --json <文件>             保存 MasterGo 完整工具契约（不会调用工具）
  --decision <路径>         平台判断：configuration|platform-enhancement|platform-capability|project-customization|project-validation|architecture-assessment
  --scope <范围>            本次确认纳入的产品范围
  --note <说明>             平台判断补充说明
  --workspace <文件>        产品工作空间 pae.workspace.json
  --ids <ID列表>            仅接受指定知识候选，多个 ID 使用英文逗号分隔
  --knowledge-dir <目录>   平台知识库目录，默认 knowledge/platform
  --module-dir <目录>      平台模块目录，默认 knowledge/platform/modules
  --option <方案ID>        实施方案：configuration|platform-enhancement|product-extension|project-customization|architecture-assessment
  --source-root <目录>     产品资料工作目录，默认 sources/platform
  --product <标识>         产品资料所属产品
  --version <版本>         产品资料版本
  --extractor <模式>       资料知识提取器：rule（默认）或 llm
  --gate <节点>             设计确认节点：requirement|solution|prd
  --type <类型>             来源类型：requirement|interview|meeting-note|screenshot|existing-feature|prd|prototype|other
  --sensitivity <级别>      来源敏感级别：public|internal|confidential
  --label <名称>            来源显示名称
  --exclude-from-analysis  不将该来源纳入 AI 分析
`;

async function buildHelp(): Promise<string> {
  const version = await readEngineVersion();
  return HELP_TEMPLATE.replace("{VERSION}", version);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function getTitle(content: string, sourcePath: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.basename(sourcePath, path.extname(sourcePath));
}

function validateRequirementContent(content: string, sourcePath: string): void {
  const trimmed = content.trim();
  if (!trimmed) throw new Error(`需求文件内容无效：${path.basename(sourcePath)}\n请至少提供非空的一级标题和需求正文。`);
  
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!heading) throw new Error(`需求文件缺少有效标题：${path.basename(sourcePath)}\n请提供以 "# " 开头的一级标题。`);
  
  const body = content.replace(/^#\s+.+$/m, "").trim();
  if (!body) throw new Error(`需求文件缺少正文内容：${path.basename(sourcePath)}\n请在标题下方提供需求正文。`);
}

const VALID_OPTIONS = new Set([
  "--project", "--project-name", "--id", "--name",
  "--product-version", "--revision", "--output-root",
  "--out", "--provider", "--model", "--knowledge-mode", "--help", "-h",
  "--dry-run", "--json", "--write", "--confirm-write", "--resume", "--pass", "--evidence", "--page", "--format", "--level", "--project-dir",
  "--decision", "--scope", "--note",
  "--workspace", "--ids", "--knowledge-dir", "--module-dir", "--option", "--source-root", "--product", "--version", "--extractor",
  "--gate", "--include", "--defer", "--objective", "--baseline", "--feature", "--project-dir",
  "--type", "--sensitivity", "--label", "--exclude-from-analysis", "--evidence-dir", "--discovery-dir", "--kind", "--action", "--problem", "--opportunity", "--hypothesis", "--metric", "--input", "--confirm", "--run", "--execute", "--scenarios",
]);

function validateArgs(args: string[]): void {
  const positionalArgs = ["requirement", "create", "deliver", "run"];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") || arg.startsWith("-")) {
      if (!VALID_OPTIONS.has(arg)) {
        throw new Error(`未知参数：${arg}\n请执行 requirement create --help 查看支持的参数。`);
      }
    } else if (!positionalArgs.includes(arg)) {
      continue;
    }
  }
}

export function sanitizeSourcePath(sourceArgument: string): string {
  // Unix/macOS/Linux absolute path
  if (path.isAbsolute(sourceArgument)) {
    return path.basename(sourceArgument);
  }
  // Windows-style absolute path (e.g., C:\Users\...)
  if (/^[A-Za-z]:[\\/]/.test(sourceArgument)) {
    const parts = sourceArgument.split(/[\\/]/);
    return parts[parts.length - 1] || sourceArgument;
  }
  return sourceArgument;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(await buildHelp());
    return;
  }

  if (args[0] === "config" && args[1] === "show" && args.length === 2) {
    const loaded = await loadPaeConfig();
    console.log(`PAE 配置：${loaded.path ?? "系统默认值"}`);
    console.log(JSON.stringify(loaded.config, null, 2));
    return;
  }

  if (args[0] === "doctor" && args.length === 1) {
    const report = await diagnosePae();
    console.log(`PAE 环境诊断：${report.status}`);
    for (const check of report.checks) console.log(`[${check.status}] ${check.message}`);
    if (report.status === "NOT_READY") process.exitCode = 1;
    return;
  }

  if (args[0] === "workspace" && ["status", "next", "decisions", "blockers", "plan", "continue", "history", "resume"].includes(args[1] ?? "") && Boolean(args[2])) {
    validateArgs(args); const orchestrator = new WorkspaceOrchestrator(); const project = path.resolve(args[2]);
    if (args[1] === "history") { console.log(JSON.stringify(await orchestrator.history(project), null, 2)); return; }
    if (args[1] === "status") { const r = await orchestrator.writeStatus(project); console.log(`工作空间状态：${r.markdownPath}`); return; }
    if (args[1] === "plan") { const r=await orchestrator.writePlan(project);console.log(`动态执行计划：${r.markdownPath}`);return; }
    if (args[1] === "next" || args[1] === "decisions" || args[1] === "blockers") { const r = await orchestrator.inspect(project); const value = args[1] === "next" ? r.next : args[1] === "decisions" ? r.decisions : r.blockers; console.log(JSON.stringify(value, null, 2)); return; }
    const run = await orchestrator.run(project, args.includes("--execute"), args.includes("--confirm"), args[1] === "resume" ? option(args,"--run") : undefined); console.log(`工作空间续办：${run.id}`); return;
  }

  if (args[0] === "ai" && ["plan", "confirm", "create-requirement"].includes(args[1] ?? "") && Boolean(args[2])) {
    validateArgs(args);
    const service = new AiProductPlanningService();
    const projectDirectory = path.resolve(args[2]);
    if (args[1] === "plan") {
      const input = option(args, "--input");
      if (!input) throw new Error("ai plan 必须提供 --input <规划输入JSON>。");
      const result = await service.plan(projectDirectory, path.resolve(input));
      console.log(`AI 产品规划：${result.gate.status}`);
      console.log(`推荐 MVP 场景：${result.gate.recommendedScenarioIds.join("、") || "无"}`);
      console.log(`规划目录：${result.directory}`);
      return;
    }
    if (args[1] === "create-requirement") {
      const input = option(args, "--input"); const id = option(args, "--id"); const name = option(args, "--name");
      if (!input || !id || !name) throw new Error("ai create-requirement 必须提供 --input、--id 和 --name。");
      const result = await new AiRequirementDesignService().create(projectDirectory, path.resolve(input), id, name, option(args, "--product-version") ?? "2.1.0");
      console.log(`AI 标准需求设计包：${result.manifest.status}`);
      console.log(`业务对象/流程/状态与异常：${result.manifest.artifacts.length} 项成果`);
      console.log(`需求目录：${result.requirementDirectory}`);
      return;
    }
    const scenarios = option(args, "--scenarios")?.split(",").map((item) => item.trim()).filter(Boolean);
    const scope = option(args, "--scope");
    if (!scenarios?.length || !scope) throw new Error("ai confirm 必须提供 --scenarios <场景ID列表> 和 --scope <首期范围>。");
    const result = await service.confirm(projectDirectory, scenarios, scope, option(args, "--note"));
    console.log("AI MVP 范围确认：PASS");
    console.log(`场景：${result.decision.scenarioIds.join("、")}`);
    console.log(`决策记录：${result.path}`);
    return;
  }

  if (args[0] === "evidence" && ["add", "list", "show", "validate", "export-public"].includes(args[1] ?? "")) {
    validateArgs(args);
    const service = new MarketEvidenceService();
    const directory = path.resolve(option(args, "--evidence-dir") ?? "output/market-evidence");
    if (args[1] === "add") {
      if (!args[2] || args[2].startsWith("-")) throw new Error("evidence add 必须提供证据 JSON 文件。");
      const result = await service.add(directory, path.resolve(args[2]));
      console.log("市场证据登记：PASS");
      console.log(`证据：${result.evidence.id}；类型：${result.evidence.type}；敏感级别：${result.evidence.sensitivity}`);
      console.log(`目录：${result.path}`);
      return;
    }
    const catalog = await service.load(directory);
    if (args[1] === "validate") {
      console.log("市场证据目录校验：PASS");
      console.log(`证据：${catalog.evidence.length}`);
      return;
    }
    if (args[1] === "list") {
      console.log(`市场证据：${catalog.evidence.length}`);
      for (const item of catalog.evidence) console.log(`${item.id} [${item.type}/${item.sensitivity}] ${item.name}`);
      return;
    }
    if (args[1] === "show") {
      if (!args[2] || args[2].startsWith("-")) throw new Error("evidence show 必须提供证据 ID。");
      const evidence = catalog.evidence.find((item) => item.id === args[2]);
      if (!evidence) throw new Error(`未找到市场证据：${args[2]}`);
      console.log(JSON.stringify(evidence, null, 2));
      return;
    }
    const output = option(args, "--out");
    if (!output) throw new Error("evidence export-public 必须提供 --out <JSON文件>。");
    const target = await service.exportPublic(directory, path.resolve(output));
    console.log(`市场证据公开导出：${target}`);
    return;
  }

  if (args[0] === "discovery" && ["derive", "review", "status"].includes(args[1] ?? "")) {
    validateArgs(args);
    const evidenceDirectory = path.resolve(option(args, "--evidence-dir") ?? "output/market-evidence");
    const discoveryDirectory = path.resolve(option(args, "--discovery-dir") ?? "output/discovery");
    const service = new DiscoveryService();
    if (args[1] === "derive") {
      const result = await service.derive(evidenceDirectory, discoveryDirectory);
      console.log(`市场发现草稿：${result.report.status}`);
      console.log(`问题/机会/价值假设：${result.report.problems.length}/${result.report.opportunities.length}/${result.report.valueHypotheses.length}`);
      console.log(`发现报告：${result.markdownPath}`);
      return;
    }
    if (args[1] === "status") {
      const result = await service.status(evidenceDirectory, discoveryDirectory);
      const all = [...result.report.problems, ...result.report.opportunities, ...result.report.valueHypotheses];
      console.log(`市场发现状态：${result.stale ? "STALE" : result.report.status.toUpperCase()}`);
      console.log(`待审核/已确认/已拒绝：${all.filter((item) => item.review.status === "pending").length}/${all.filter((item) => item.review.status === "confirmed").length}/${all.filter((item) => item.review.status === "rejected").length}`);
      return;
    }
    const kind = option(args, "--kind") as DiscoveryKind | undefined; const id = option(args, "--id"); const action = option(args, "--action");
    if (!kind || !(["problem", "opportunity", "value-hypothesis"] as DiscoveryKind[]).includes(kind)) throw new Error("--kind 必须是：problem、opportunity 或 value-hypothesis。");
    if (!id || !action || !["confirm", "reject"].includes(action)) throw new Error("discovery review 必须提供 --id 和 --action confirm|reject。");
    const result = await service.review(evidenceDirectory, discoveryDirectory, kind, id, action === "confirm" ? "confirmed" : "rejected", option(args, "--note"));
    console.log(`市场发现审核：${result.report.status}`); console.log(`审核记录：${result.jsonPath}`);
    return;
  }

  if (args[0] === "value" && ["link", "check"].includes(args[1] ?? "") && Boolean(args[2])) {
    validateArgs(args);
    const discoveryDirectory = option(args, "--discovery-dir");
    if (!discoveryDirectory) throw new Error("value 命令必须提供 --discovery-dir <目录>。");
    const service = new ValueChainService(); const requirementDirectory = path.resolve(args[2]);
    if (args[1] === "check") {
      const result = await service.check(requirementDirectory, path.resolve(discoveryDirectory));
      console.log(`需求价值链校验：${result.check.valid ? "PASS" : "FAIL"}`); console.log(`校验报告：${result.markdownPath}`);
      if (!result.check.valid) process.exitCode = 1;
      return;
    }
    const problemId = option(args, "--problem"); const opportunityId = option(args, "--opportunity"); const hypothesisId = option(args, "--hypothesis"); const metric = option(args, "--metric");
    if (!problemId || !opportunityId || !hypothesisId || !metric) throw new Error("value link 必须提供 --problem、--opportunity、--hypothesis 和 --metric <指标JSON>。");
    const result = await service.link(requirementDirectory, path.resolve(discoveryDirectory), { problemId, opportunityId, valueHypothesisId: hypothesisId }, path.resolve(metric));
    console.log("需求价值链：LINKED"); console.log(`成功指标：${result.chain.successMetric.id}`); console.log(`价值链：${result.markdownPath}`);
    return;
  }

  if (args[0] === "release" && args[1] === "objective" && ["set", "check"].includes(args[2] ?? "") && Boolean(args[3])) {
    validateArgs(args); const version = option(args, "--version");
    if (!version) throw new Error("release objective 必须提供 --version <版本>。");
    const service = new ReleaseObjectiveService(); const projectDirectory = path.resolve(args[3]);
    if (args[2] === "check") {
      const result = await service.check(projectDirectory, version); console.log(`版本目标校验：${result.check.valid ? "PASS" : "FAIL"}`); console.log(`校验报告：${result.markdownPath}`); if (!result.check.valid) process.exitCode = 1; return;
    }
    const input = option(args, "--input"); if (!input) throw new Error("release objective set 必须提供 --input <目标JSON>。");
    const result = await service.set(projectDirectory, version, path.resolve(input)); console.log("版本目标确认：PASS"); console.log(`目标：${result.objective.objective}`); console.log(`指标文件：${result.markdownPath}`); return;
  }

  if (args[0] === "release" && args[1] === "retrospect" && Boolean(args[2])) {
    validateArgs(args); const version = option(args, "--version"); const input = option(args, "--input");
    if (!version || !input) throw new Error("release retrospect 必须提供 --version <版本> 和 --input <实际结果JSON>。");
    const result = await new ReleaseRetrospectiveService().record(path.resolve(args[2]), version, path.resolve(input));
    console.log("发布后复盘：RECORDED"); console.log(`指标结果：${result.report.results.length}`); console.log(`复盘报告：${result.markdownPath}`); return;
  }

  if (args[0] === "release" && args[1] === "market-finalize" && Boolean(args[2])) {
    validateArgs(args); const version = option(args, "--version"); const evidenceDirectory = option(args, "--evidence-dir"); const discoveryDirectory = option(args, "--discovery-dir");
    if (!version || !evidenceDirectory || !discoveryDirectory) throw new Error("release market-finalize 必须提供 --version、--evidence-dir 和 --discovery-dir。");
    const result = await finalizeMarketDelivery(path.resolve(args[2]), version, path.resolve(evidenceDirectory), path.resolve(discoveryDirectory));
    console.log(`市场决策正式验收：${result.acceptance.status}`); console.log(`交付清单：${result.manifestPath}`); console.log(`正式交付包：${result.zipPath}`); return;
  }

  if (args[0] === "competitor" && args[1] === "analyze" && Boolean(args[2])) {
    validateArgs(args);
    const baseline = option(args, "--baseline"); const output = option(args, "--out");
    if (!baseline || !output) throw new Error("competitor analyze 必须提供 --baseline <平台能力JSON> 和 --out <报告目录>。");
    const result = await analyzeCompetitor(path.resolve(args[2]), path.resolve(baseline), path.resolve(output));
    console.log("竞品能力对标：PENDING_PRODUCT_MANAGER_REVIEW");
    console.log(`功能：${result.report.summary.total}；已具备/部分具备/未具备：${result.report.summary.available}/${result.report.summary.partial}/${result.report.summary.missing}`);
    console.log(`分析报告：${result.markdownPath}`);
    return;
  }

  if (args[0] === "competitor" && args[1] === "review" && Boolean(args[2])) {
    validateArgs(args);
    const feature = option(args, "--feature"); const decision = option(args, "--decision") as CompetitorDecision | undefined; const scope = option(args, "--scope");
    if (!feature || !decision || !scope) throw new Error("competitor review 必须提供 --feature、--decision 和 --scope。");
    const result = await reviewCompetitorFeature(path.resolve(args[2]), feature, decision, scope, option(args, "--note"));
    console.log(`竞品功能审核：${result.review.status.toUpperCase()}`); console.log(`审核记录：${result.path}`); return;
  }

  if (args[0] === "competitor" && args[1] === "create-requirement" && Boolean(args[2])) {
    validateArgs(args);
    const feature = option(args, "--feature"); const projectDirectory = option(args, "--project-dir"); const id = option(args, "--id"); const name = option(args, "--name");
    if (!feature || !projectDirectory || !id || !name) throw new Error("competitor create-requirement 必须提供 --feature、--project-dir、--id 和 --name。");
    const result = await createRequirementFromCompetitor(path.resolve(args[2]), path.resolve(projectDirectory), feature, id, name, option(args, "--product-version"));
    console.log("竞品功能转标准需求：CREATED"); console.log(`需求设计包：${result.requirementDirectory}`); console.log(`需求输入：${result.inputPath}`); return;
  }

  if (args[0] === "competitor" && args[1] === "prioritize" && Boolean(args[2])) {
    validateArgs(args); const result = await prioritizeCompetitorCandidates(path.resolve(args[2]));
    console.log(`竞品候选优先级：${result.candidates.filter((item) => item.reviewStatus === "CONFIRMED").length}/${result.candidates.length} 已确认`);
    console.log(`产品经理评分：${result.reviewPath}`); console.log(`评估报告：${result.markdownPath}`); return;
  }

  if (args[0] === "competitor" && args[1] === "backlog" && Boolean(args[2])) {
    validateArgs(args); const projectDirectory = option(args, "--project-dir"); if (!projectDirectory) throw new Error("competitor backlog 必须提供 --project-dir <项目目录>。");
    const result = await buildCompetitorBacklog(path.resolve(args[2]), path.resolve(projectDirectory));
    console.log(`竞品候选需求池：${result.backlog.summary.linked}/${result.backlog.summary.total} 已关联标准需求`); console.log(`候选需求池：${result.markdownPath}`); if (result.portfolioPath) console.log(`v1.7.0 需求组合：${result.portfolioPath}`); return;
  }

  if (args[0] === "competitor" && args[1] === "finalize" && Boolean(args[2])) {
    validateArgs(args); const projectDirectory = option(args, "--project-dir"); if (!projectDirectory) throw new Error("competitor finalize 必须提供 --project-dir <项目目录>。");
    const result = await finalizeCompetitorDelivery(path.resolve(args[2]), path.resolve(projectDirectory));
    console.log(`竞品分析正式验收：${result.acceptance.status}`); console.log(`交付清单：${result.manifestPath}`); console.log(`正式交付包：${result.zipPath}`); return;
  }

  if (args[0] === "extension" && args[1] === "validate" && Boolean(args[2])) {
    const extension = await loadExtension(path.resolve(args[2]));
    console.log(`扩展校验：PASS`);
    console.log(`扩展：${extension.manifest.name}（${extension.manifest.id}@${extension.manifest.version}）`);
    console.log(`类型：${extension.manifest.type}；资源：${extension.resources.length}`);
    return;
  }

  if (args[0] === "extension" && args[1] === "compose" && args.length >= 3) {
    const extensions = await Promise.all(args.slice(2).map((directory) => loadExtension(path.resolve(directory))));
    const context = composeExtensionContext(extensions);
    console.log(`扩展组合：PASS`);
    console.log(`加载顺序：${context.extensions.map((item) => `${item.id}@${item.version}`).join(" → ")}`);
    console.log(`有效资源：${context.resources.length}；显式冲突：${context.conflicts.length}`);
    for (const conflict of context.conflicts) console.log(`[覆盖] ${conflict.resourceType}/${conflict.resourceId}：${conflict.previous.extensionId} → ${conflict.selected.extensionId}`);
    return;
  }

  if (args[0] === "workspace" && args[1] === "validate" && Boolean(args[2])) {
    const loaded = await loadExtensionWorkspace(args[2]);
    console.log(`产品工作空间校验：PASS`);
    console.log(`工作空间：${loaded.workspace.name}（${loaded.workspace.id}）`);
    console.log(`产品：${loaded.workspace.product.name} ${loaded.workspace.product.version}`);
    console.log(`扩展顺序：${loaded.context.extensions.map((item) => item.id).join(" → ")}`);
    console.log(`有效资源：${loaded.context.resources.length}；显式冲突：${loaded.context.conflicts.length}`);
    return;
  }

  if (args[0] === "platform" && args[1] === "confirm" && Boolean(args[2])) {
    validateArgs(args);
    const decision = option(args, "--decision") as PlatformBoundaryPath | undefined;
    const scope = option(args, "--scope");
    const allowed: PlatformBoundaryPath[] = ["configuration", "platform-enhancement", "platform-capability", "project-customization", "project-validation", "architecture-assessment"];
    if (!decision || !allowed.includes(decision)) throw new Error(`--decision 必须是：${allowed.join("、")}`);
    if (!scope) throw new Error("platform confirm 必须提供 --scope <范围>。");
    const output = await confirmPlatformDecision(path.resolve(args[2]), { path: decision, scope, note: option(args, "--note") });
    console.log("平台判断确认：PASS");
    console.log(`决定：${output.confirmation.decision.path}`);
    console.log(`范围：${output.confirmation.decision.scope}`);
    console.log(`确认记录：${output.path}`);
    console.log("下一步：使用原需求命令加 --resume 继续正式设计。");
    return;
  }

  if (args[0] === "knowledge" && args[1] === "accept" && Boolean(args[2])) {
    validateArgs(args);
    const workspacePath = option(args, "--workspace");
    const ids = option(args, "--ids")?.split(",").map((item) => item.trim()).filter(Boolean);
    const knowledgeDirectory = option(args, "--knowledge-dir");
    if (workspacePath && knowledgeDirectory) throw new Error("knowledge accept 只能选择 --workspace 或 --knowledge-dir 其中一种目标。");
    if (workspacePath) {
      const output = await acceptKnowledgeFeedback(path.resolve(args[2]), workspacePath, ids);
      console.log("产品知识回流：PASS");
      console.log(`接受候选：${output.accepted.length}`);
      console.log(`知识索引：#${output.sequence} ${output.indexPath}`);
      if (output.snapshotPath) console.log(`历史快照：${output.snapshotPath}`);
    } else if (knowledgeDirectory) {
      const output = await acceptPlatformKnowledgeFeedback(path.resolve(args[2]), path.resolve(knowledgeDirectory), ids);
      console.log("平台知识晋级：PASS");
      console.log(`确认知识：${output.accepted.length}`);
      console.log(`平台目录：${output.catalogPath}`);
      console.log(`历史快照：${output.snapshotPath}`);
    } else throw new Error("knowledge accept 必须提供 --workspace <文件> 或 --knowledge-dir <目录>。");
    return;
  }

  if (args[0] === "knowledge" && args[1] === "extract" && Boolean(args[2])) {
    validateArgs(args);
    const output = await extractPlatformKnowledgeFeedback(path.resolve(args[2]));
    console.log("平台知识候选提取：PASS");
    console.log(`候选：${output.report.candidates.length}`);
    console.log(`审核文件：${output.markdownPath}`);
    return;
  }

  if (args[0] === "knowledge" && args[1] === "review" && Boolean(args[2])) {
    validateArgs(args);
    const report = await readPlatformKnowledgeFeedback(path.resolve(args[2]));
    console.log(renderPlatformKnowledgeFeedback(report));
    return;
  }

  if (args[0] === "knowledge" && ["validate", "list", "show", "search"].includes(args[1] ?? "")) {
    validateArgs(args);
    const service = new PlatformKnowledgeService();
    const directory = path.resolve(option(args, "--knowledge-dir") ?? "knowledge/platform");
    const catalog = await service.load(directory);
    if (args[1] === "validate") {
      console.log("平台知识库校验：PASS");
      console.log(`产品：${catalog.product.name} ${catalog.product.version}`);
      console.log(`知识版本：${catalog.version}；条目：${catalog.entities.length}`);
      return;
    }
    if (args[1] === "list") {
      const entities = service.list(catalog);
      console.log(`平台知识：${entities.length}`);
      for (const entity of entities) console.log(`${entity.id} [${entity.kind}/${entity.status}] ${entity.name}`);
      return;
    }
    if (!args[2] || args[2].startsWith("-")) throw new Error(`knowledge ${args[1]} 必须提供${args[1] === "show" ? "知识 ID" : "关键词"}。`);
    if (args[1] === "show") {
      const entity = catalog.byId.get(args[2]);
      if (!entity) throw new Error(`未找到平台知识：${args[2]}`);
      console.log(JSON.stringify(entity, null, 2));
      return;
    }
    const matches = service.search(catalog, args[2]);
    console.log(`平台知识检索：${matches.length}`);
    for (const entity of matches) console.log(`${entity.id} [${entity.kind}] ${entity.name}`);
    return;
  }

  if (args[0] === "capability" && ["analyze", "gap"].includes(args[1] ?? "") && Boolean(args[2])) {
    validateArgs(args);
    const sourcePath = path.resolve(args[2]);
    const content = await readFile(sourcePath, "utf8");
    validateRequirementContent(content, sourcePath);
    const service = new PlatformKnowledgeService();
    const catalog = await service.load(path.resolve(option(args, "--knowledge-dir") ?? "knowledge/platform"));
    const report = assessCapabilityGap({ sourcePath, content, title: getTitle(content, sourcePath) }, catalog);
    const rendered = args[1] === "analyze" ? `${JSON.stringify(report, null, 2)}\n` : renderCapabilityGapAssessment(report);
    const output = option(args, "--out");
    if (output) {
      const target = path.resolve(output);
      await writeFile(target, rendered, "utf8");
      console.log(`平台能力${args[1] === "analyze" ? "分析" : "差距报告"}：${target}`);
    } else console.log(rendered.trimEnd());
    return;
  }

  if (args[0] === "module" && ["validate", "list", "show", "graph"].includes(args[1] ?? "")) {
    validateArgs(args);
    const service = new PlatformModuleService();
    const directory = path.resolve(option(args, "--module-dir") ?? "knowledge/platform/modules");
    const catalog = await service.load(directory);
    if (args[1] === "validate") {
      console.log("平台模块目录校验：PASS");
      console.log(`产品：${catalog.productId}；目录版本：${catalog.version}；模块：${catalog.modules.length}`);
      return;
    }
    if (args[1] === "list") {
      console.log(`平台模块：${catalog.modules.length}`);
      for (const module of catalog.modules) console.log(`${module.id} [${module.status}] ${module.name}；依赖 ${module.dependencies.length}`);
      return;
    }
    if (args[1] === "show") {
      if (!args[2] || args[2].startsWith("-")) throw new Error("module show 必须提供模块 ID。");
      const module = catalog.byId.get(args[2]);
      if (!module) throw new Error(`未找到平台模块：${args[2]}`);
      console.log(JSON.stringify(module, null, 2));
      return;
    }
    const rendered = service.renderMermaid(catalog);
    const output = option(args, "--out");
    if (output) {
      const target = path.resolve(output);
      await writeFile(target, rendered, "utf8");
      console.log(`平台模块依赖图：${target}`);
    } else console.log(rendered.trimEnd());
    return;
  }

  if (args[0] === "impact" && args[1] === "analyze" && Boolean(args[2])) {
    validateArgs(args);
    const sourcePath = path.resolve(args[2]);
    const content = await readFile(sourcePath, "utf8");
    validateRequirementContent(content, sourcePath);
    const moduleService = new PlatformModuleService();
    const catalog = await moduleService.load(path.resolve(option(args, "--module-dir") ?? "knowledge/platform/modules"));
    const report = analyzeCrossModuleImpact({ sourcePath, title: getTitle(content, sourcePath), content }, catalog);
    const output = option(args, "--out");
    if (output) {
      const directory = path.resolve(output);
      await mkdir(directory, { recursive: true });
      const jsonPath = path.join(directory, "module-impact-report.json");
      const markdownPath = path.join(directory, "module-impact-report.md");
      const graphPath = path.join(directory, "dependency-graph.mmd");
      await Promise.all([
        writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
        writeFile(markdownPath, renderCrossModuleImpact(report), "utf8"),
        writeFile(graphPath, renderCrossModuleMermaid(report), "utf8"),
      ]);
      console.log(`跨模块影响分析：${report.boundary.status}`);
      console.log(`直接/间接/回归：${report.summary.direct}/${report.summary.indirect}/${report.summary.regression}`);
      console.log(`平台化建议：${report.boundary.recommendation}（${report.boundary.confidence}）`);
      console.log(`分析报告：${markdownPath}`);
    } else console.log(renderCrossModuleImpact(report).trimEnd());
    return;
  }

  if (args[0] === "solution" && args[1] === "compare" && Boolean(args[2])) {
    validateArgs(args);
    const output = option(args, "--out");
    if (!output) throw new Error("solution compare 必须提供 --out <需求目录>。");
    const report = JSON.parse(await readFile(path.resolve(args[2]), "utf8"));
    if (report.schemaVersion !== "1.6" || !report.requirement?.fingerprint || !report.moduleCatalog?.version || !Array.isArray(report.impacts)) throw new Error("影响分析JSON结构无效。");
    const result = await writeSolutionComparison(path.resolve(output), report);
    console.log("实施方案比较：pending-product-manager-selection");
    console.log(`候选方案：${result.comparison.options.length}`);
    console.log(`建议方案：${result.comparison.recommendedOptionId}`);
    console.log(`比较报告：${result.markdownPath}`);
    return;
  }

  if (args[0] === "solution" && args[1] === "list" && Boolean(args[2])) {
    validateArgs(args);
    const requirementDirectory = path.resolve(args[2]);
    const comparison = await readSolutionComparison(requirementDirectory);
    const gate = await evaluateSolutionGate(requirementDirectory);
    console.log(`实施方案：${comparison.options.length}；门禁：${gate.status}`);
    for (const item of comparison.options) console.log(`${item.id}${item.recommended ? " [推荐]" : ""} ${item.name}`);
    console.log(`允许继续正式设计：${gate.canProceed ? "是" : "否"}`);
    return;
  }

  if (args[0] === "solution" && args[1] === "select" && Boolean(args[2])) {
    validateArgs(args);
    const selected = option(args, "--option") as SolutionOptionId | undefined;
    const scope = option(args, "--scope");
    const allowed: SolutionOptionId[] = ["configuration", "platform-enhancement", "product-extension", "project-customization", "architecture-assessment"];
    if (!selected || !allowed.includes(selected)) throw new Error(`--option 必须是：${allowed.join("、")}`);
    if (!scope) throw new Error("solution select 必须提供 --scope <范围>。");
    const result = await selectSolution(path.resolve(args[2]), selected, scope, option(args, "--note"));
    console.log("实施方案选择：SELECTED");
    console.log(`方案：${result.decision.selectedOptionId}`);
    console.log(`范围：${result.decision.scope}`);
    console.log(`决策记录：${result.path}`);
    return;
  }

  if (args[0] === "design-unit" && args[1] === "generate" && Boolean(args[2]) && Boolean(args[3])) {
    validateArgs(args);
    const report = JSON.parse(await readFile(path.resolve(args[3]), "utf8"));
    if (report.schemaVersion !== "1.6" || !report.requirement?.fingerprint || !Array.isArray(report.impacts)) throw new Error("影响分析JSON结构无效。");
    const result = await generateDesignUnitPlan(path.resolve(args[2]), report);
    console.log("复杂需求设计单元：GENERATED");
    console.log(`已选方案：${result.plan.selectedOptionId}`);
    console.log(`设计单元：${result.plan.units.length}`);
    console.log(`设计单元计划：${result.markdownPath}`);
    return;
  }

  if (args[0] === "design-unit" && args[1] === "check" && Boolean(args[2])) {
    validateArgs(args);
    const result = await writeDesignUnitTraceability(path.resolve(args[2]));
    console.log(`设计单元跨成果物追踪：${result.report.valid ? "PASS" : "FAIL"}`);
    console.log(`覆盖：${result.report.summary.coveredReferenceCount}/${result.report.summary.expectedReferenceCount}`);
    console.log(`追踪报告：${result.markdownPath}`);
    if (!result.report.valid) process.exitCode = 1;
    return;
  }

  if (args[0] === "change" && ["snapshot", "detect"].includes(args[1] ?? "") && Boolean(args[2]) && Boolean(args[3]) && Boolean(args[4])) {
    validateArgs(args);
    const sourcePath = path.resolve(args[3]);
    const content = await readFile(sourcePath, "utf8");
    validateRequirementContent(content, sourcePath);
    const input = { sourcePath, title: getTitle(content, sourcePath), content };
    const report = JSON.parse(await readFile(path.resolve(args[4]), "utf8"));
    if (report.schemaVersion !== "1.6" || !report.requirement?.fingerprint || !Array.isArray(report.impacts)) throw new Error("影响分析JSON结构无效。");
    if (args[1] === "snapshot") {
      const result = await captureRequirementDesignSnapshot(path.resolve(args[2]), input, report);
      console.log(`需求设计快照：#${result.snapshot.sequence}`);
      console.log(`设计单元：${result.snapshot.designUnitPlan.units.length}`);
      console.log(`快照：${result.path}`);
    } else {
      const result = await writeRequirementChangeReport(path.resolve(args[2]), input, report);
      console.log(`需求变更检测：${result.report.status}`);
      console.log(`影响/保留设计单元：${result.report.summary.affectedUnits}/${result.report.summary.preservedUnits}`);
      console.log(`变更报告：${result.markdownPath}`);
      if (result.report.status === "CHANGE_DETECTED") process.exitCode = 2;
    }
    return;
  }

  if (args[0] === "change" && args[1] === "status" && Boolean(args[2])) {
    validateArgs(args);
    const report = await readRequirementChangeReport(path.resolve(args[2]));
    console.log(`需求变更：${report.status}`);
    console.log(`模块新增/修改/移除：${report.summary.addedModules}/${report.summary.modifiedModules}/${report.summary.removedModules}`);
    console.log(`设计单元影响/保留：${report.summary.affectedUnits}/${report.summary.preservedUnits}`);
    console.log(`需要重新确认：${report.invalidatedConfirmations.join("、") || "无"}`);
    return;
  }

  if (args[0] === "complex" && ["prepare", "finalize"].includes(args[1] ?? "") && Boolean(args[2]) && Boolean(args[3])) {
    validateArgs(args);
    const sourcePath = path.resolve(args[3]);
    const content = await readFile(sourcePath, "utf8");
    validateRequirementContent(content, sourcePath);
    const input = { sourcePath, title: getTitle(content, sourcePath), content };
    const requirementDirectory = path.resolve(args[2]);
    if (args[1] === "prepare") {
      const result = await prepareComplexRequirement(requirementDirectory, input, path.resolve(option(args, "--module-dir") ?? "knowledge/platform/modules"));
      console.log(`复杂需求准备：${result.status}`);
      console.log(`直接/间接/回归：${result.impact.summary.direct}/${result.impact.summary.indirect}/${result.impact.summary.regression}`);
      console.log(`建议方案：${result.impact.boundary.recommendation}`);
      console.log(`方案比较：${result.comparisonPath}`);
      if (result.status === "WAITING_SOLUTION_SELECTION") process.exitCode = 2;
    } else {
      const result = await finalizeComplexRequirement(requirementDirectory, input);
      console.log(`跨模块复杂需求验收：${result.report.status}`);
      console.log(`设计单元/引用：${result.report.designUnits.count}/${result.report.designUnits.referenceCount}`);
      console.log(`正式快照：#${result.report.snapshotSequence ?? 0}`);
      console.log(`验收报告：${result.markdownPath}`);
      if (result.report.status !== "PASS") process.exitCode = 1;
    }
    return;
  }

  if (args[0] === "portfolio" && args[1] === "build" && Boolean(args[2])) {
    validateArgs(args);
    const result = await buildRequirementPortfolio(path.resolve(args[2]));
    console.log("需求组合：BUILT");
    console.log(`候选需求：${result.portfolio.summary.total}`);
    console.log(`READY/CONDITIONAL/BLOCKED/STALE：${result.portfolio.summary.READY}/${result.portfolio.summary.CONDITIONAL}/${result.portfolio.summary.BLOCKED}/${result.portfolio.summary.STALE}`);
    console.log(`组合报告：${result.markdownPath}`);
    return;
  }

  if (args[0] === "portfolio" && args[1] === "assess" && Boolean(args[2])) {
    validateArgs(args);
    const result = await assessRequirementPortfolio(path.resolve(args[2]));
    console.log("需求组合评估：ASSESSED");
    console.log(`已确认/待复核：${result.assessment.summary.confirmed}/${result.assessment.summary.awaitingReview}`);
    console.log(`产品经理复核：${result.reviewPath}`);
    console.log(`评估报告：${result.markdownPath}`);
    return;
  }

  if (args[0] === "portfolio" && args[1] === "relate" && Boolean(args[2])) {
    validateArgs(args);
    const result = await analyzePortfolioRelationships(path.resolve(args[2]));
    console.log("跨需求关系分析：ANALYZED");
    console.log(`关系/阻断：${result.analysis.summary.total}/${result.analysis.summary.blocker}`);
    console.log(`关系报告：${result.markdownPath}`);
    console.log(`关系图谱：${result.graphPath}`);
    return;
  }

  if (args[0] === "release" && ["plan", "options", "select"].includes(args[1] ?? "") && Boolean(args[2])) {
    validateArgs(args);
    const version = option(args, "--version"); if (!version) throw new Error("release 命令必须提供 --version <版本>。");
    const projectDirectory = path.resolve(args[2]);
    if (args[1] === "plan") {
      const result = await generateReleaseOptions(projectDirectory, version);
      console.log(`版本候选方案：${result.optionSet.options.length}`); console.log(`方案报告：${result.markdownPath}`);
    } else if (args[1] === "options") {
      const result = await readReleaseOptions(projectDirectory, version);
      for (const item of result.options) console.log(`${item.id} ${item.name}：${item.includedRequirementIds.join("、") || "无"}`);
    } else {
      const selected = option(args, "--option") as ReleaseOptionId | undefined; const allowed: ReleaseOptionId[] = ["foundation-first", "value-first", "risk-control"];
      if (!selected || !allowed.includes(selected)) throw new Error(`--option 必须是：${allowed.join("、")}`);
      const split = (value?: string): string[] | undefined => value ? value.split(",").map((item) => item.trim()).filter(Boolean) : undefined;
      const result = await selectReleaseScope(projectDirectory, version, selected, split(option(args, "--include")), split(option(args, "--defer")), option(args, "--note"));
      console.log("版本范围选择：SELECTED"); console.log(`纳入：${result.decision.includedRequirementIds.join("、")}`); console.log(`决策记录：${result.path}`);
    }
    return;
  }

  if (args[0] === "release" && ["baseline", "detect", "status"].includes(args[1] ?? "") && Boolean(args[2])) {
    validateArgs(args); const version = option(args, "--version"); if (!version) throw new Error("release 命令必须提供 --version <版本>。"); const projectDirectory = path.resolve(args[2]);
    if (args[1] === "baseline") { const result = await establishReleaseBaseline(projectDirectory, version); console.log(`版本基线：#${result.baseline.sequence}`); console.log(`正式基线：${result.path}`); }
    else if (args[1] === "detect") { const result = await detectReleaseChanges(projectDirectory, version); console.log(`版本变化：${result.report.status}`); console.log(`变化报告：${result.markdownPath}`); if (result.report.status === "CHANGE_DETECTED") process.exitCode = 2; }
    else { const result = await readReleaseStatus(projectDirectory, version); console.log(`版本基线：#${result.baseline.sequence}`); console.log(`版本状态：${result.change?.status ?? "NOT_CHECKED"}`); }
    return;
  }

  if (args[0] === "release" && args[1] === "finalize" && Boolean(args[2])) {
    validateArgs(args); const version = option(args, "--version"); const objective = option(args, "--objective");
    if (!version || !objective) throw new Error("release finalize 必须提供 --version 和 --objective。");
    const result = await finalizeReleasePlanning(path.resolve(args[2]), version, objective);
    console.log(`版本规划整合验收：${result.acceptance.status}`); console.log(`交付目录：${result.directory}`); console.log(`交付清单：${result.manifestPath}`); return;
  }

  if (args[0] === "material" && args[1] === "add" && Boolean(args[2])) {
    validateArgs(args);
    const type = option(args, "--type") as ProductSourceType | undefined;
    const sensitivity = option(args, "--sensitivity") as ProductSourceSensitivity | undefined;
    const product = option(args, "--product");
    if (!type || !PRODUCT_SOURCE_TYPES.includes(type)) throw new Error(`--type 必须是：${PRODUCT_SOURCE_TYPES.join("、")}`);
    if (!sensitivity || !PRODUCT_SOURCE_SENSITIVITIES.includes(sensitivity)) throw new Error(`--sensitivity 必须是：${PRODUCT_SOURCE_SENSITIVITIES.join("、")}`);
    if (!product) throw new Error("material add 必须提供 --product <产品标识>。");
    const root = path.resolve(option(args, "--source-root") ?? "sources/platform");
    const source = await new ProductSourceService().add(root, path.resolve(args[2]), { type, sensitivity, product, name: option(args, "--label"), version: option(args, "--version") });
    console.log("产品资料登记：PASS");
    console.log(`资料：${source.id} ${source.name}`);
    console.log(`格式：${source.format}；敏感级别：${source.sensitivity}`);
    console.log(`指纹：${source.contentFingerprint}`);
    return;
  }

  if (args[0] === "material" && args[1] === "list") {
    validateArgs(args);
    const root = path.resolve(option(args, "--source-root") ?? "sources/platform");
    const catalog = await new ProductSourceService().loadCatalog(root);
    console.log(`产品资料：${catalog.sources.length}`);
    for (const source of catalog.sources) console.log(`${source.id} [${source.type}/${source.format}/${source.sensitivity}] ${source.name}`);
    return;
  }

  if (args[0] === "material" && args[1] === "extract" && Boolean(args[2])) {
    validateArgs(args);
    const root = path.resolve(option(args, "--source-root") ?? "sources/platform");
    const output = await new ProductSourceService().extract(root, args[2]);
    console.log(`产品资料解析：${output.report.status}`);
    console.log(`章节：${output.report.sections.length}；警告：${output.report.warnings.length}`);
    console.log(`解析结果：${output.jsonPath}`);
    return;
  }

  if (args[0] === "material" && args[1] === "derive" && Boolean(args[2])) {
    validateArgs(args);
    const extractorMode = option(args, "--extractor") ?? "rule";
    if (extractorMode !== "rule" && extractorMode !== "llm") throw new Error("--extractor 仅支持 rule 或 llm。");
    let extractor;
    if (extractorMode === "llm") {
      const config = loadLlmConfig(process.env, { provider: option(args, "--provider"), model: option(args, "--model") });
      if (config.provider !== "openai") throw new Error("LLM资料知识提取必须配置 openai Provider。");
      extractor = new LlmMaterialKnowledgeExtractor(new OpenAiProvider({ apiKey: config.apiKey!, model: config.model, baseUrl: config.baseUrl, timeoutMs: config.timeoutMs }), config.maxRetries + 1);
    }
    const output = await deriveMaterialKnowledge(path.resolve(args[2]), option(args, "--out") ? path.resolve(option(args, "--out")!) : undefined, { extractor });
    console.log("产品资料知识候选：PENDING_PRODUCT_MANAGER_REVIEW");
    console.log(`提取器：${output.report.extractor?.id} [${output.report.extractor?.mode}]${output.report.extractor?.model ? ` ${output.report.extractor.model}` : ""}`);
    console.log(`候选：${output.report.candidates.length}`);
    console.log(`审核文件：${output.markdownPath}`);
    return;
  }

  if (args[0] === "material" && args[1] === "compare" && Boolean(args[2])) {
    validateArgs(args);
    const derivation = JSON.parse(await readFile(path.resolve(args[2]), "utf8")) as MaterialKnowledgeDerivation;
    if (derivation.schemaVersion !== "1.5" || derivation.status !== "pending-product-manager-review") throw new Error("产品资料知识候选文件无效。");
    const knowledgeDirectory = path.resolve(option(args, "--knowledge-dir") ?? "knowledge/platform");
    const catalog = await new PlatformKnowledgeService().load(knowledgeDirectory);
    const report = compareMaterialCandidates(derivation, catalog);
    const directory = option(args, "--out") ? path.resolve(option(args, "--out")!) : path.join(path.dirname(path.resolve(args[2])), "comparison");
    const output = await writeMaterialComparison(report, directory);
    console.log("知识候选比较：PENDING_PRODUCT_MANAGER_REVIEW");
    console.log(`重复：${report.comparisons.filter((item) => item.decision === "duplicate").length}；新增：${report.comparisons.filter((item) => item.decision === "new-knowledge").length}；待判断：${report.comparisons.filter((item) => !["duplicate", "new-knowledge"].includes(item.decision)).length}`);
    console.log(`比较报告：${output.markdownPath}`);
    console.log(`审核决定：${output.reviewPath}`);
    return;
  }

  if (args[0] === "material" && args[1] === "package" && Boolean(args[2]) && Boolean(args[3]) && Boolean(args[4])) {
    validateArgs(args);
    const output = await prepareMaterialPromotionPackage(path.resolve(args[2]), path.resolve(args[3]), path.resolve(args[4]), option(args, "--out") ? path.resolve(option(args, "--out")!) : undefined);
    console.log("产品资料知识晋升包：APPROVED_FOR_EXPLICIT_PROMOTION");
    console.log(`已审核新增知识：${output.promotion.candidates.length}`);
    console.log(`晋升包：${output.jsonPath}`);
    return;
  }

  if (args[0] === "material" && args[1] === "promote" && Boolean(args[2])) {
    validateArgs(args);
    const knowledgeDirectory = option(args, "--knowledge-dir");
    if (!knowledgeDirectory) throw new Error("material promote 必须显式提供 --knowledge-dir <平台知识目录>。");
    const output = await promoteMaterialPackage(path.resolve(args[2]), path.resolve(knowledgeDirectory));
    console.log("产品资料知识晋升：PASS");
    console.log(`正式知识：${output.acceptedIds.join("、")}`);
    console.log(`历史快照：${output.snapshotPath}`);
    return;
  }

  if (args[0] === "design" && args[1] === "status" && Boolean(args[2])) {
    validateArgs(args);
    const output = await writeRealRequirementLoopReport(path.resolve(args[2]));
    console.log(`真实需求设计闭环：${output.report.status}`);
    console.log(`确认进度：${output.report.summary.confirmed}/${output.report.summary.total}`);
    if (output.report.currentGate) console.log(`当前节点：${output.report.currentGate}`);
    console.log(`状态报告：${output.markdownPath}`);
    if (output.report.status !== "READY_FOR_DEVELOPMENT_REVIEW") process.exitCode = 2;
    return;
  }

  if (args[0] === "design" && args[1] === "confirm" && Boolean(args[2])) {
    validateArgs(args);
    const gate = option(args, "--gate");
    if (gate !== "requirement" && gate !== "solution" && gate !== "prd") throw new Error("design confirm 必须提供 --gate requirement|solution|prd。");
    const output = await confirmDesignGate(path.resolve(args[2]), gate, option(args, "--note"));
    console.log(`${output.confirmation.gate} 确认：PASS`);
    console.log(`确认记录：${output.path}`);
    return;
  }

  if (args[0] === "design" && args[1] === "check" && Boolean(args[2])) {
    validateArgs(args);
    const output = await runDesignReview(path.resolve(args[2]));
    console.log(`跨成果物设计检查：${output.report.status}`);
    console.log(`阻断/重要/一般/建议：${output.report.summary.BLOCKER}/${output.report.summary.IMPORTANT}/${output.report.summary.NORMAL}/${output.report.summary.SUGGESTION}`);
    console.log(`检查报告：${output.markdownPath}`);
    if (output.report.status === "FAIL") process.exitCode = 1;
    else if (output.report.status === "PENDING") process.exitCode = 2;
    return;
  }

  if (args[0] === "source" && args[1] === "add" && Boolean(args[2]) && Boolean(args[3])) {
    validateArgs(args);
    const type = option(args, "--type") as RequirementSourceType | undefined;
    const sensitivity = option(args, "--sensitivity") as RequirementSourceSensitivity | undefined;
    const types: RequirementSourceType[] = ["requirement", "interview", "meeting-note", "screenshot", "existing-feature", "prd", "prototype", "other"];
    const sensitivities: RequirementSourceSensitivity[] = ["public", "internal", "confidential"];
    if (!type || !types.includes(type)) throw new Error(`--type 必须是：${types.join("、")}`);
    if (!sensitivity || !sensitivities.includes(sensitivity)) throw new Error(`--sensitivity 必须是：${sensitivities.join("、")}`);
    const output = await addRequirementSource(path.resolve(args[2]), args[3], { type, sensitivity, label: option(args, "--label"), includeInAnalysis: !args.includes("--exclude-from-analysis") });
    console.log(`需求来源已登记：${output.source.id} ${output.source.label}`);
    console.log(`敏感级别：${output.source.sensitivity}；纳入分析：${output.source.includeInAnalysis ? "是" : "否"}`);
    console.log(`来源索引：${output.indexPath}`);
    return;
  }

  if (args[0] === "source" && args[1] === "list" && Boolean(args[2])) {
    validateArgs(args);
    const index = await readRequirementSourceIndex(path.resolve(args[2]));
    console.log(`真实需求来源：${index.sources.length}`);
    for (const source of index.sources) console.log(`${source.id} ${source.label} [${source.type}/${source.sensitivity}] 分析=${source.includeInAnalysis ? "是" : "否"}`);
    return;
  }

  if (args[0] === "product" && args[1] === "status") {
    validateArgs(args);
    const projectDirectory = option(args, "--project-dir");
    if (!projectDirectory) throw new Error("product status 必须提供 --project-dir <项目目录>。");
    const baseline = await loadProductBaseline(path.resolve(projectDirectory));
    if (!baseline) throw new Error("项目尚未建立正式产品基线。");
    console.log(`产品：${baseline.product.name}`); console.log(`产品版本：${baseline.product.version}`); console.log(`正式基线：#${baseline.baseline.sequence}`); console.log(`已接受需求：${baseline.requirements.length}`); console.log(`页面：${baseline.pages.length}；模块：${baseline.modules.length}；规则：${baseline.rules.length}`);
    return;
  }

  if (args[0] === "product" && args[1] === "accept" && Boolean(args[2])) {
    validateArgs(args);
    const output = await acceptProductBaseline(path.resolve(args[2]));
    console.log(`产品基线已接受：#${output.previousSequence} → #${output.sequence}`); console.log(`正式基线：${output.baselinePath}`); console.log(`历史快照：${output.snapshotPath}`); console.log(`更新成果：${output.updatedArtifacts.join("、")}`);
    return;
  }

  if (args[0] === "validate" && Boolean(args[1])) {
    validateArgs(args);
    if ((option(args, "--level") ?? "release") !== "release") throw new Error("--level 当前仅支持 release。");
    const output = await runReleaseQualityGate(path.resolve(args[1]));
    console.log(`Release 质量门禁：${output.report.status}`);
    console.log(`质量报告：${output.markdownPath}`);
    if (output.report.status !== "PASS") process.exitCode = 1;
    return;
  }

  const isPrototypePush = args[0] === "prototype" && args[1] === "push" && Boolean(args[2]);
  if (isPrototypePush) {
    validateArgs(args);
    if (args.includes("--dry-run")) {
      const output = await preparePrototypePush(path.resolve(args[2]), { dryRun: true });
      console.log("MasterGo 操作计划已生成（dry-run，未修改画布）。");
      console.log(`操作数：${output.result.totalOperations}`);
      console.log(`操作计划：${output.planPath}`);
      console.log(`执行结果：${output.resultPath}`);
      return;
    }
    if (!args.includes("--write") || !args.includes("--confirm-write")) {
      throw new Error("真实写入必须同时使用 --write --confirm-write；仅预览请使用 --dry-run。");
    }
    const loaded = await loadMasterGoMcpConfig();
    if (!loaded) throw new Error("未找到 MasterGo MCP 配置。请先运行 pae mastergo doctor。");
    const output = await executeMasterGoPagePipeline(path.resolve(args[2]), new StdioMasterGoConnection(loaded.config, { timeoutMs: 120_000 }), { confirmedWrite: true, resume: args.includes("--resume") });
    console.log(`MasterGo 真实写入：${output.status}`);
    if (output.status === "PENDING_VERIFICATION") console.log("MasterGo 已受理逐页写入，仍需在画布中核验最终渲染结果；当前不判定为 PASS。");
    console.log(`写入计划：${output.planPath}`);
    console.log(`执行结果：${output.resultPath}`);
    if (output.status === "FAIL") process.exitCode = 1;
    return;
  }

  const isPrototypeVerify = args[0] === "prototype" && args[1] === "verify" && Boolean(args[2]);
  if (isPrototypeVerify) {
    validateArgs(args);
    if (!args.includes("--pass")) throw new Error("人工画布验收回写必须显式使用 --pass。");
    const evidence = option(args, "--evidence");
    if (!evidence) throw new Error("人工画布验收回写必须提供 --evidence <证据说明>。");
    const pageIndex = args.indexOf("--page");
    const pageId = pageIndex >= 0 ? args[pageIndex + 1] : undefined;
    if (pageIndex >= 0 && !pageId) throw new Error("--page 必须提供页面 ID。");
    const output = await verifyMasterGoCanvas(path.resolve(args[2]), evidence, undefined, pageId);
    console.log(`MasterGo 人工画布验收：${output.status}`);
    console.log(`执行结果：${output.resultPath}`);
    return;
  }

  const isMasterGoDoctor = args[0] === "mastergo" && args[1] === "doctor" && args.length === 2;
  if (isMasterGoDoctor) {
    const loaded = await loadMasterGoMcpConfig();
    const report = await diagnoseMasterGo(loaded, loaded ? {
      connectionFactory: async () => new StdioMasterGoConnection(loaded.config),
    } : undefined);
    console.log(`MasterGo MCP 诊断：${report.status}`);
    for (const check of report.checks) console.log(`[${check.status}] ${check.message}`);
    if (report.connection?.serverName) {
      console.log(`Server：${report.connection.serverName}${report.connection.serverVersion ? ` ${report.connection.serverVersion}` : ""}`);
    }
    if (report.nextAction) console.log(`下一步：${report.nextAction}`);
    if (report.status !== "READY") process.exitCode = 1;
    return;
  }

  const isDeliveryCheck = args[0] === "delivery" && args[1] === "check" && Boolean(args[2]);
  if (isDeliveryCheck) {
    const output = await runDeliveryCheck(path.resolve(args[2]));
    console.log(`完整交付一致性检查：${output.report.valid ? "PASS" : "FAIL"}`);
    console.log(`MasterGo 写入：${output.report.checks.masterGoSubmission}`);
    console.log(`检查报告：${output.markdownPath}`);
    if (!output.report.valid) process.exitCode = 1;
    return;
  }

  const isDocumentExport = args[0] === "document" && args[1] === "export" && Boolean(args[2]);
  if (isDocumentExport) {
    validateArgs(args);
    const format = option(args, "--format") ?? "all";
    if (!['docx', 'pdf', 'all'].includes(format)) throw new Error("--format 仅支持 docx、pdf 或 all。");
    const formats: DocumentFormat[] = format === "all" ? ["docx", "pdf"] : [format as DocumentFormat];
    const output = await prepareDocumentExport(path.resolve(args[2]), formats);
    console.log(`正式文档导出：${output.manifest.status}`);
    for (const result of output.manifest.results) console.log(`${result.format.toUpperCase()}：${result.status} — ${result.outputPath}`);
    console.log(`Document DSL：${output.documentModelPath}`);
    console.log(`导出清单：${output.manifestPath}`);
    return;
  }

  const isDeliveryPackage = args[0] === "delivery" && args[1] === "package" && Boolean(args[2]);
  if (isDeliveryPackage) {
    const output = await buildFormalDelivery(path.resolve(args[2]));
    console.log("完整交付包：GENERATED");
    console.log(`交付目录：${output.directory}`);
    console.log(`ZIP：${output.zipPath}`);
    console.log(`文档清单：${output.documentManifestPath}`);
    console.log(`交付清单：${output.deliveryManifestPath}`);
    console.log(`严格检查：${output.validationReportPath}`);
    return;
  }

  const isDeliveryValidate = args[0] === "delivery" && args[1] === "validate" && Boolean(args[2]);
  if (isDeliveryValidate) {
    const output = await validateFormalDelivery(path.resolve(args[2]));
    console.log(`正式交付一致性检查：${output.report.valid ? "PASS" : "FAIL"}`);
    console.log(`检查报告：${output.markdownPath}`);
    if (!output.report.valid) process.exitCode = 1;
    return;
  }

  const isManualGenerate = args[0] === "manual" && args[1] === "generate" && Boolean(args[2]);
  if (isManualGenerate) {
    const output = await generateManualDelivery(path.resolve(args[2]));
    console.log("产品手册与操作手册已生成。");
    console.log(`产品手册：${output.productManualPath}`);
    console.log(`操作手册：${output.operationManualPath}`);
    console.log(`追踪矩阵：${output.traceabilityPath}`);
    return;
  }

  const isManualCheck = args[0] === "manual" && args[1] === "check" && Boolean(args[2]);
  if (isManualCheck) {
    const output = await runManualCheck(path.resolve(args[2]));
    console.log(`手册一致性检查：${output.report.valid ? "PASS" : "FAIL"}`);
    console.log(`检查报告：${output.markdownPath}`);
    if (!output.report.valid) process.exitCode = 1;
    return;
  }

  const isManualUpdate = args[0] === "manual" && args[1] === "update" && Boolean(args[2]);
  if (isManualUpdate) {
    const output = await updateManualDelivery(path.resolve(args[2]));
    console.log(`手册增量更新：${output.report.changed ? "已更新" : "无来源变化"}`);
    console.log(`保留手工补充：${output.report.preservedManualNotes.length} 处`);
    console.log(`影响报告：${output.reportPath}`);
    return;
  }

  const isAcceptanceReport = args[0] === "acceptance" && args[1] === "report" && Boolean(args[2]);
  if (isAcceptanceReport) {
    const output = await generateAcceptanceReport(path.resolve(args[2]));
    console.log(`正式验收报告：${output.status}`);
    console.log(`验收报告：${output.reportPath}`);
    if (output.status === "FAIL") process.exitCode = 1;
    return;
  }

  const isMasterGoTools = args[0] === "mastergo" && args[1] === "tools";
  if (isMasterGoTools) {
    validateArgs(args);
    const jsonPath = option(args, "--json");
    const loaded = await loadMasterGoMcpConfig();
    if (!loaded) throw new Error("未找到 MasterGo MCP 配置。请先运行 pae mastergo doctor。");
    const connection = new StdioMasterGoConnection(loaded.config);
    try {
      const info = await connection.probe();
      if (!info.capabilities.includes("tools")) throw new Error("MasterGo MCP Server 未声明 tools 能力。");
      const discovery = await connection.listTools();
      if (jsonPath) {
        const report = {
          schemaVersion: "0.1",
          capturedAt: new Date().toISOString(),
          server: info,
          tools: discovery.tools,
          requiredWritePipeline: ["design_page", "submit_page_to_canvas"],
        };
        await writeFile(path.resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      }
      console.log(`MasterGo MCP 工具：${discovery.tools.length} 个`);
      for (const tool of discovery.tools) {
        const tags = [tool.inputSchema ? "schema" : "no-schema", discovery.writableTools.includes(tool.name) ? "write-candidate" : "read/unknown"];
        console.log(`- ${tool.name} [${tags.join(", ")}]${tool.description ? `：${tool.description}` : ""}`);
      }
      console.log(`画布写入候选：${discovery.writableTools.length ? discovery.writableTools.join("、") : "未识别"}`);
      if (jsonPath) console.log(`完整工具契约：${path.resolve(jsonPath)}`);
      if (!discovery.hasCanvasWriteCapability) process.exitCode = 2;
    } finally { await connection.close(); }
    return;
  }

  const isRequirementCreate = args[0] === "requirement" && args[1] === "create" && Boolean(args[2]);
  const isDeliver = args[0] === "deliver" && Boolean(args[1]);
  const isLegacyRun = args[0] === "run" && Boolean(args[1]);
  if (!isRequirementCreate && !isDeliver && !isLegacyRun) throw new Error(`命令格式错误。\n\n${await buildHelp()}`);
  const sourceArgument = isRequirementCreate ? args[2] : args[1];
  const sourcePath = path.resolve(sourceArgument);
  const content = await readFile(sourcePath, "utf8");
  const storedSourcePath = sanitizeSourcePath(sourceArgument);

  validateRequirementContent(content, sourcePath);
  validateArgs(args);

  const input = { sourcePath: storedSourcePath, content, title: getTitle(content, sourcePath) };
  const paeConfig = (await loadPaeConfig()).config;
  const knowledgeMode = option(args, "--knowledge-mode") ?? paeConfig.knowledge?.mode ?? "auto";
  if (knowledgeMode !== "auto" && knowledgeMode !== "off") {
    throw new Error("--knowledge-mode 仅支持 auto 或 off。");
  }
  let extensionDirectories = paeConfig.extensions?.enabled ? paeConfig.extensions.directories ?? [] : [];
  let configuredExtensionContext: Awaited<ReturnType<typeof loadExtensionWorkspace>>["context"] | undefined;
  if (paeConfig.extensions?.enabled && paeConfig.extensions.workspace) {
    const loadedWorkspace = await loadExtensionWorkspace(paeConfig.extensions.workspace);
    extensionDirectories = [...loadedWorkspace.extensionDirectories, ...extensionDirectories];
    configuredExtensionContext = loadedWorkspace.context;
  }

  const llmConfig = loadLlmConfig(process.env, {
    provider: option(args, "--provider") ?? paeConfig.llm?.provider,
    model: option(args, "--model") ?? paeConfig.llm?.model,
  });
  const fallbackExecutor = new MockStageExecutor();
  const provider = llmConfig.provider === "openai"
    ? new OpenAiProvider({
      apiKey: llmConfig.apiKey!,
      model: llmConfig.model,
      baseUrl: llmConfig.baseUrl,
      timeoutMs: llmConfig.timeoutMs,
    })
    : new MockLlmProvider(llmConfig.model);
  const workflow = new ProductDesignWorkflow(new LlmWorkflowExecutor(
    provider,
    fallbackExecutor,
    llmConfig.maxRetries,
    llmConfig.timeoutMs,
  ));
  let outputDirectory: string;
  let context;
  if (isRequirementCreate || isDeliver) {
    const projectId = option(args, "--project") ?? paeConfig.project?.id;
    const requirementId = option(args, "--id");
    const requirementName = option(args, "--name");
    if (!projectId || !requirementId || !requirementName) throw new Error(`缺少 --project、--id 或 --name。\n\n${await buildHelp()}`);
    const revisionArg = option(args, "--revision");
    const revision = revisionArg !== undefined ? Number(revisionArg) : undefined;
    if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
      throw new Error("--revision 必须是大于等于 1 的整数。");
    }
    const prepared = await prepareRequirementOutput({
      outputRoot: option(args, "--output-root") ?? "output",
      projectId,
      projectName: option(args, "--project-name") ?? paeConfig.project?.name ?? projectId,
      productVersion: option(args, "--product-version") ?? paeConfig.project?.productVersion ?? "0.1.0",
      requirementId,
      requirementName,
      revision,
      resume: args.includes("--resume") || paeConfig.execution?.resume,
    }, input);
    outputDirectory = prepared.requirementDirectory;
    context = await workflow.run(input, outputDirectory, prepared.context, { knowledgeMode, resume: args.includes("--resume") || paeConfig.execution?.resume, retries: paeConfig.execution?.retries, extensionDirectories, extensionContext: configuredExtensionContext, requirePlatformConfirmation: extensionDirectories.length > 0 });
  } else {
    const outputPath = option(args, "--out") ?? "output/latest";
    const resolvedOutput = path.resolve(outputPath);

    // 参数优先级：CLI 明确参数 > 已有项目元数据 > 输入文档可解析内容 > 输出路径推断
    const explicitProjectId = option(args, "--project");
    const explicitProjectName = option(args, "--project-name");
    const explicitRequirementId = option(args, "--id");
    const explicitRequirementName = option(args, "--name");

    const inferredProjectId = explicitProjectId ?? path.basename(resolvedOutput);
    const inferredRequirementName = explicitRequirementName
      ?? path.basename(sourcePath, path.extname(sourcePath)).toLowerCase().replace(/\s+/g, "-");
    const inferredRequirementId = explicitRequirementId
      ?? `REQ-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

    const prepared = await prepareRequirementOutput({
      outputRoot: path.dirname(resolvedOutput),
      projectId: inferredProjectId || "default-project",
      projectName: explicitProjectName ?? explicitProjectId ?? path.basename(resolvedOutput),
      productVersion: option(args, "--product-version") ?? "0.1.0",
      requirementId: inferredRequirementId,
      requirementName: inferredRequirementName || "requirement",
      revision: option(args, "--revision") !== undefined ? Number(option(args, "--revision")) : undefined,
    }, input);
    outputDirectory = prepared.requirementDirectory;
    context = await workflow.run(input, outputDirectory, prepared.context, { knowledgeMode, resume: args.includes("--resume") || paeConfig.execution?.resume, retries: paeConfig.execution?.retries, extensionDirectories, extensionContext: configuredExtensionContext, requirePlatformConfirmation: extensionDirectories.length > 0 });
  }

  const failedStages = context.stageResults?.filter(s => s.status === "failed") || [];
  if (failedStages.length > 0) {
    console.log(`PAE 执行完成，但有 ${failedStages.length} 个阶段失败。`);
    console.log(`失败阶段：${failedStages.map(s => s.id).join("、")}`);
    console.log(`Run ID: ${context.runId}`);
    console.log(`需求设计包: ${outputDirectory}`);
    process.exitCode = 1;
  } else {
    if (context.requirement) {
      const projectDirectory = path.dirname(path.dirname(outputDirectory));
      const baseline = await establishInitialProductBaseline(projectDirectory, outputDirectory, context.requirement);
      console.log(baseline.created
        ? `产品基线已建立：${path.join(projectDirectory, "product", "product-baseline.json")}`
        : `产品基线已保护：普通运行未覆盖现有基线 #${baseline.baseline.baseline.sequence}`);
    }
    console.log(`PAE 已完成 10 个阶段。`);
    console.log(`Run ID: ${context.runId}`);
    console.log(`需求设计包: ${outputDirectory}`);
    if (isDeliver) {
      console.log("正在生成产品手册与操作手册……");
      await generateManualDelivery(outputDirectory);
      const manualCheck = await runManualCheck(outputDirectory);
      if (!manualCheck.report.valid) throw new Error(`手册一致性检查失败：${manualCheck.markdownPath}`);
      const delivery = await buildFormalDelivery(outputDirectory);
      const qualityGate = await runReleaseQualityGate(outputDirectory);
      if (qualityGate.report.status !== "PASS") throw new Error(`Release 质量门禁失败：${qualityGate.markdownPath}`);
      console.log("PAE 正式交付：PASS");
      console.log(`正式交付包: ${delivery.zipPath}`);
      console.log(`严格检查: ${delivery.validationReportPath}`);
      console.log(`交付总览: ${qualityGate.summaryPath}`);
    }
  }
}

export function isCliEntry(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath || !moduleUrl.startsWith("file:")) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    return realpathSync(argvPath) === realpathSync(modulePath);
  } catch {
    return path.resolve(argvPath) === modulePath
      || path.basename(argvPath) === path.basename(modulePath);
  }
}

const isMainModule = isCliEntry(process.argv[1], import.meta.url);

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
