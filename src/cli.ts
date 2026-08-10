#!/usr/bin/env node
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

const HELP_TEMPLATE = `PAE — Product Design AI Engine v{VERSION}

用法：
  pae requirement create <需求文件> --project <项目标识> --id <需求编号> --name <需求标识> [选项]
  pae run <需求文件> [--out <输出目录>] [选项]
  pae prototype push <需求目录> --dry-run
  pae prototype push <需求目录> --write --confirm-write
  pae prototype push <需求目录> --write --confirm-write --resume
  pae prototype verify <需求目录> --pass --evidence <证据说明>
  pae mastergo doctor
  pae mastergo tools [--json <文件>]
  pae --help

示例：
  pae requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request
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
  "--dry-run", "--json", "--write", "--confirm-write", "--resume", "--pass", "--evidence",
]);

function validateArgs(args: string[]): void {
  const positionalArgs = ["requirement", "create", "run"];
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
    const output = await verifyMasterGoCanvas(path.resolve(args[2]), evidence);
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
  const isLegacyRun = args[0] === "run" && Boolean(args[1]);
  if (!isRequirementCreate && !isLegacyRun) throw new Error(`命令格式错误。\n\n${await buildHelp()}`);
  const sourceArgument = isRequirementCreate ? args[2] : args[1];
  const sourcePath = path.resolve(sourceArgument);
  const content = await readFile(sourcePath, "utf8");
  const storedSourcePath = sanitizeSourcePath(sourceArgument);

  validateRequirementContent(content, sourcePath);
  validateArgs(args);

  const input = { sourcePath: storedSourcePath, content, title: getTitle(content, sourcePath) };
  const knowledgeMode = option(args, "--knowledge-mode") ?? "auto";
  if (knowledgeMode !== "auto" && knowledgeMode !== "off") {
    throw new Error("--knowledge-mode 仅支持 auto 或 off。");
  }

  const llmConfig = loadLlmConfig(process.env, {
    provider: option(args, "--provider"),
    model: option(args, "--model"),
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
  if (isRequirementCreate) {
    const projectId = option(args, "--project");
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
      projectName: option(args, "--project-name") ?? projectId,
      productVersion: option(args, "--product-version") ?? "0.1.0",
      requirementId,
      requirementName,
      revision,
    }, input);
    outputDirectory = prepared.requirementDirectory;
    context = await workflow.run(input, outputDirectory, prepared.context, { knowledgeMode });
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
    context = await workflow.run(input, outputDirectory, prepared.context, { knowledgeMode });
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
  }
}

const isMainModule = import.meta.url.startsWith("file:")
  && (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)
    || path.basename(process.argv[1] ?? "") === path.basename(fileURLToPath(import.meta.url)));

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
