import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { prepareRequirementOutput } from "../src/output/requirement-output.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const input = {
  sourcePath: "examples/base-platform-user-management.md",
  title: "基础平台用户管理",
  content: "# 基础平台用户管理\n\n用户列表需要展示状态，姓名和账号必填，停用前必须确认。",
};

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

test("TC-050-027: 未指定知识模式的旧调用仍以 auto 完成", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v050-old-command-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, output);
  const manifest = await readJson<{ status: string; knowledge: { mode: string } }>(path.join(output, "manifest.json"));
  assert.equal(manifest.status, "completed");
  assert.equal(manifest.knowledge.mode, "auto");
});

test("TC-050-028: v0.4.0 manifest 缺少 knowledge 字段时仍可按兼容结构读取", async () => {
  const manifest = await readJson<{
    engine: string;
    version: string;
    stages: Array<{ id: string; status: string }>;
    knowledge?: unknown;
  }>(path.join("test", "fixtures", "legacy-compatibility", "manifest.json"));
  assert.equal(manifest.engine, "pd-ai-engine");
  assert.ok(manifest.version);
  assert.ok(Array.isArray(manifest.stages));
  assert.equal(manifest.knowledge, undefined);
});

test("TC-050-031: 用户管理 A/B 两组成果物可独立归档并标记模式", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v050-ab-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const groupA = path.join(root, "group-a-knowledge-off");
  const groupB = path.join(root, "group-b-knowledge-auto");
  await workflow.run(input, groupA, undefined, { knowledgeMode: "off" });
  await workflow.run(input, groupB, undefined, { knowledgeMode: "auto" });
  const a = await readJson<{ knowledge: { mode: string; selectedKnowledge: unknown[] } }>(path.join(groupA, "manifest.json"));
  const b = await readJson<{ knowledge: { mode: string; selectedKnowledge: unknown[] } }>(path.join(groupB, "manifest.json"));
  assert.equal(a.knowledge.mode, "off");
  assert.deepEqual(a.knowledge.selectedKnowledge, []);
  assert.equal(b.knowledge.mode, "auto");
  assert.ok(b.knowledge.selectedKnowledge.length > 0);
});

test("TC-050-033: 重跑自动递增 revision 并保留上一版知识追踪", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-v050-revisions-"));
  const options = {
    outputRoot,
    projectId: "base-platform",
    projectName: "基础平台",
    productVersion: "1.0.0",
    requirementId: "REQ-050-001",
    requirementName: "user-management",
  };
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const first = await prepareRequirementOutput(options, input);
  await workflow.run(input, first.requirementDirectory, first.context, { knowledgeMode: "off" });
  const firstManifest = await readFile(path.join(first.requirementDirectory, "manifest.json"), "utf8");

  const second = await prepareRequirementOutput(options, input);
  await workflow.run(input, second.requirementDirectory, second.context, { knowledgeMode: "auto" });
  const archivedManifestPath = path.join(second.requirementDirectory, "revisions", "revision-1", "manifest.json");
  const archivedManifest = await readFile(archivedManifestPath, "utf8");
  const currentManifest = await readJson<{ requirement: { revision: number }; knowledge: { mode: string } }>(path.join(second.requirementDirectory, "manifest.json"));

  assert.equal(second.context.revision, 2);
  assert.equal(archivedManifest, firstManifest);
  assert.match(archivedManifest, /"mode": "off"/);
  assert.equal(currentManifest.requirement.revision, 2);
  assert.equal(currentManifest.knowledge.mode, "auto");
});
