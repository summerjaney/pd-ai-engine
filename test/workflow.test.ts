import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

test("完整运行 MVP 工作流并由 Prototype DSL 派生 PRD", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "测试产品",
    content: "# 测试产品\n\n创建并审批申请。",
  }, output);

  assert.equal(context.artifacts.prototype?.schemaVersion, "0.1");
  assert.match(context.artifacts.prd ?? "", /单一事实来源/);
  const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")) as { stages: unknown[] };
  assert.equal(manifest.stages.length, 8);
});
