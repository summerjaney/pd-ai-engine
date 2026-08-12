import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { STAGE_IDS, type StageExecutor, type StageId } from "../src/domain/types.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { prepareRequirementOutput } from "../src/output/requirement-output.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const input = { sourcePath: "requirement.md", title: "组织结构", content: "# 组织结构\n\n支持维护上下级关系。" };

test("TC-100-007: 失败后从首个未成功阶段续跑", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-resume-"));
  const delegate = new MockStageExecutor();
  const first: StageExecutor = { execute(stage, context) {
    if (stage === "core-flow") throw new Error("暂时故障");
    return delegate.execute(stage, context);
  } };
  await assert.rejects(() => new ProductDesignWorkflow(first).run(input, root), /工作流执行失败/);

  const calls: StageId[] = [];
  const second: StageExecutor = { execute(stage, context) { calls.push(stage); return delegate.execute(stage, context); } };
  await new ProductDesignWorkflow(second).run(input, root, undefined, { resume: true });
  assert.deepEqual(calls, STAGE_IDS.slice(3));
  const state = JSON.parse(await readFile(path.join(root, "run.json"), "utf8")) as { status: string; resumedFromRunId?: string; stages: Array<{ status: string }> };
  assert.equal(state.status, "SUCCEEDED");
  assert.ok(state.resumedFromRunId);
  assert.ok(state.stages.slice(0, 3).every((stage) => stage.status === "SKIPPED"));
});

test("TC-100-008: 阶段瞬时失败按配置重试并记录事件", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-retry-"));
  const delegate = new MockStageExecutor();
  let attempts = 0;
  const executor: StageExecutor = { execute(stage, context) {
    if (stage === "product-outline" && ++attempts === 1) throw new Error("瞬时故障");
    return delegate.execute(stage, context);
  } };
  await new ProductDesignWorkflow(executor).run(input, root, undefined, { retries: 1 });
  const events = await readFile(path.join(root, "run-events.jsonl"), "utf8");
  assert.match(events, /"type":"STAGE_RETRIED"/);
  assert.equal(attempts, 2);
});

test("TC-100-009: 输入变化使既有阶段全部失效", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-stale-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, root);
  const calls: StageId[] = [];
  const delegate = new MockStageExecutor();
  const executor: StageExecutor = { execute(stage, context) { calls.push(stage); return delegate.execute(stage, context); } };
  await new ProductDesignWorkflow(executor).run({ ...input, content: `${input.content}\n新增批量调整。` }, root, undefined, { resume: true });
  assert.deepEqual(calls, [...STAGE_IDS]);
});

test("TC-100-010: 同一输入续跑保持 revision 且不重复归档", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-v100-idempotent-"));
  const options = { outputRoot, projectId: "base", projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-001", requirementName: "organization" };
  const first = await prepareRequirementOutput(options, input);
  const second = await prepareRequirementOutput({ ...options, resume: true }, input);
  assert.equal(first.context.revision, 1);
  assert.equal(second.context.revision, 1);
  await assert.rejects(() => readFile(path.join(second.requirementDirectory, "revisions", "revision-1", "requirement.json")), /ENOENT/);
});

test("TC-100-011: 连续续跑保持幂等且不重新执行阶段", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-repeat-resume-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, root);
  const calls: StageId[] = [];
  const delegate = new MockStageExecutor();
  const executor: StageExecutor = { execute(stage, context) { calls.push(stage); return delegate.execute(stage, context); } };
  await new ProductDesignWorkflow(executor).run(input, root, undefined, { resume: true });
  await new ProductDesignWorkflow(executor).run(input, root, undefined, { resume: true });
  assert.deepEqual(calls, []);
});
