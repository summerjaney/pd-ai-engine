#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { MockStageExecutor } from "./execution/mock-executor.js";
import { ProductDesignWorkflow } from "./workflow/workflow.js";
import { prepareRequirementOutput } from "./output/requirement-output.js";

const HELP = `PAE — Product Design AI Engine v0.3.0

用法：
  pae requirement create <需求文件> --project <项目标识> --id <需求编号> --name <需求标识> [选项]
  pae run <需求文件> [--out <输出目录>] [选项]
  pae --help

示例：
  pae requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request
  pae run examples/b2b-requirement.md --out output/legacy-example --project hr-system --id REQ-001 --name leave-request

选项：
  --project <标识>            项目唯一标识（requirement create 必填，run 可选）
  --project-name <名称>       项目显示名称，默认使用项目标识
  --id <需求编号>             需求唯一编号（requirement create 必填，run 可选）
  --name <需求标识>           需求标识名称（requirement create 必填，run 可选）
  --product-version <版本>   被设计产品版本，默认 0.1.0
  --revision <数字>          需求修订版本，默认 1
  --output-root <目录>       输出根目录，默认 output
  --out <目录>                输出目录（仅 run 命令，默认 output/latest）
`;

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
  "--out", "--help", "-h",
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const isRequirementCreate = args[0] === "requirement" && args[1] === "create" && Boolean(args[2]);
  const isLegacyRun = args[0] === "run" && Boolean(args[1]);
  if (!isRequirementCreate && !isLegacyRun) throw new Error(`命令格式错误。\n\n${HELP}`);
  const sourceArgument = isRequirementCreate ? args[2] : args[1];
  const sourcePath = path.resolve(sourceArgument);
  const content = await readFile(sourcePath, "utf8");

  validateRequirementContent(content, sourcePath);
  validateArgs(args);

  const input = { sourcePath, content, title: getTitle(content, sourcePath) };

  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  let outputDirectory: string;
  let context;
  if (isRequirementCreate) {
    const projectId = option(args, "--project");
    const requirementId = option(args, "--id");
    const requirementName = option(args, "--name");
    if (!projectId || !requirementId || !requirementName) throw new Error(`缺少 --project、--id 或 --name。\n\n${HELP}`);
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
    context = await workflow.run(input, outputDirectory, prepared.context);
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
    context = await workflow.run(input, outputDirectory, prepared.context);
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
