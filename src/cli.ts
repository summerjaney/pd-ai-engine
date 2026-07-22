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
  pae run <需求文件> [--out <输出目录>]
  pae --help

示例：
  pae requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request
  pae run examples/b2b-requirement.md --out output/legacy-example

选项：
  --project-name <名称>       项目显示名称，默认使用项目标识
  --product-version <版本>   被设计产品版本，默认 0.1.0
  --revision <数字>          需求修订版本，默认 1
  --output-root <目录>       输出根目录，默认 output
`;

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function getTitle(content: string, sourcePath: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.basename(sourcePath, path.extname(sourcePath));
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
  const input = { sourcePath, content, title: getTitle(content, sourcePath) };

  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  let outputDirectory: string;
  let context;
  if (isRequirementCreate) {
    const projectId = option(args, "--project");
    const requirementId = option(args, "--id");
    const requirementName = option(args, "--name");
    if (!projectId || !requirementId || !requirementName) throw new Error(`缺少 --project、--id 或 --name。\n\n${HELP}`);
    const revision = Number(option(args, "--revision") ?? "1");
    if (!Number.isInteger(revision) || revision < 1) throw new Error("--revision 必须是大于等于 1 的整数。");
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
    outputDirectory = path.resolve(option(args, "--out") ?? "output/latest");
    context = await workflow.run(input, outputDirectory);
  }

  console.log(`PAE 已完成 10 个阶段。`);
  console.log(`Run ID: ${context.runId}`);
  console.log(`需求设计包: ${outputDirectory}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
