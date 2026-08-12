#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
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
  "--dry-run", "--json", "--write", "--confirm-write", "--resume", "--pass", "--evidence", "--page", "--format", "--level",
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
    context = await workflow.run(input, outputDirectory, prepared.context, { knowledgeMode, resume: args.includes("--resume") || paeConfig.execution?.resume, retries: paeConfig.execution?.retries });
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
    context = await workflow.run(input, outputDirectory, prepared.context, { knowledgeMode, resume: args.includes("--resume") || paeConfig.execution?.resume, retries: paeConfig.execution?.retries });
  }

  const failedStages = context.stageResults?.filter(s => s.status === "failed") || [];
  if (failedStages.length > 0) {
    console.log(`PAE 执行完成，但有 ${failedStages.length} 个阶段失败。`);
    console.log(`失败阶段：${failedStages.map(s => s.id).join("、")}`);
    console.log(`Run ID: ${context.runId}`);
    console.log(`需求设计包: ${outputDirectory}`);
    process.exitCode = 1;
  } else {
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
