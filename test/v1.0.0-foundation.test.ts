import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { isCliEntry } from "../src/cli.js";
import { loadPaeConfig } from "../src/config/loader.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import type { StageExecutor } from "../src/domain/types.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const input = { sourcePath: "requirement.md", title: "组织结构管理", content: "# 组织结构管理\n\n支持维护组织上下级关系。" };

test("TC-100-016: npm bin 符号链接可识别为 CLI 主入口", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-bin-"));
  const target = path.join(root, "cli.js");
  const bin = path.join(root, "pae");
  await writeFile(target, "#!/usr/bin/env node\n", "utf8");
  await symlink(target, bin);
  assert.equal(isCliEntry(bin, pathToFileURL(target).href), true);
});

test("TC-100-001: 缺少项目配置时加载安全默认值", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-config-default-"));
  const loaded = await loadPaeConfig(root);
  assert.equal(loaded.path, undefined);
  assert.equal(loaded.config.schemaVersion, "1.0");
  assert.equal(loaded.config.llm?.provider, "mock");
  assert.deepEqual(loaded.config.delivery?.formats, ["docx", "pdf"]);
});

test("TC-100-002: 项目配置拒绝旧契约和无效重试次数", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-config-invalid-"));
  await writeFile(path.join(root, "pae.config.json"), JSON.stringify({ schemaVersion: "0.9" }));
  await assert.rejects(() => loadPaeConfig(root), /schemaVersion 必须为 1\.0/);
  await writeFile(path.join(root, "pae.config.json"), JSON.stringify({ schemaVersion: "1.0", execution: { retries: -1 } }));
  await assert.rejects(() => loadPaeConfig(root), /retries 必须是大于等于 0 的整数/);
});

test("TC-100-003: 成功执行持久化 1.0 运行状态和事件流", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-run-success-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, root);
  const state = JSON.parse(await readFile(path.join(root, "run.json"), "utf8")) as { schemaVersion: string; status: string; currentStage?: string; stages: Array<{ status: string; durationMs: number }> };
  const events = (await readFile(path.join(root, "run-events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { type: string });
  assert.equal(state.schemaVersion, "1.0");
  assert.equal(state.status, "SUCCEEDED");
  assert.equal(state.currentStage, undefined);
  assert.equal(state.stages.length, 10);
  assert.ok(state.stages.every((stage) => stage.status === "SUCCEEDED" && stage.durationMs >= 0));
  assert.equal(events[0].type, "RUN_STARTED");
  assert.equal(events.at(-1)?.type, "RUN_SUCCEEDED");
});

test("TC-100-004: 失败执行记录失败阶段并将后续阶段标记为跳过", async () => {
  const delegate = new MockStageExecutor();
  const executor: StageExecutor = {
    async execute(stage, context) {
      if (stage === "core-flow") throw new Error("模拟阶段故障");
      return delegate.execute(stage, context);
    },
  };
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-run-failure-"));
  await assert.rejects(() => new ProductDesignWorkflow(executor).run(input, root), /工作流执行失败/);
  const state = JSON.parse(await readFile(path.join(root, "run.json"), "utf8")) as { status: string; stages: Array<{ id: string; status: string; error?: string }> };
  assert.equal(state.status, "FAILED");
  assert.equal(state.stages.find((stage) => stage.id === "core-flow")?.status, "FAILED");
  assert.match(state.stages.find((stage) => stage.id === "core-flow")?.error ?? "", /模拟阶段故障/);
  assert.ok(state.stages.filter((stage) => stage.id !== "requirement-analysis" && stage.id !== "product-outline" && stage.id !== "product-architecture" && stage.id !== "core-flow").every((stage) => stage.status === "SKIPPED"));
});
