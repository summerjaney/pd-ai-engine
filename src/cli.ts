#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { MockStageExecutor } from "./execution/mock-executor.js";
import { ProductDesignWorkflow } from "./workflow/workflow.js";

const HELP = `PAE — Product Design AI Engine v0.2.0

用法：
  pae run <需求文件> [--out <输出目录>]
  pae --help

示例：
  pae run examples/b2b-requirement.md --out output/example
`;

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

  if (args[0] !== "run" || !args[1]) throw new Error(`命令格式错误。\n\n${HELP}`);
  const sourcePath = path.resolve(args[1]);
  const outIndex = args.indexOf("--out");
  const outputDirectory = path.resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : "output/latest");
  const content = await readFile(sourcePath, "utf8");

  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({ sourcePath, content, title: getTitle(content, sourcePath) }, outputDirectory);

  console.log(`PAE 已完成 8 个阶段。`);
  console.log(`Run ID: ${context.runId}`);
  console.log(`产品设计包: ${outputDirectory}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
