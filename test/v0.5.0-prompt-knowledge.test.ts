import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WorkflowContext } from "../src/domain/types.js";
import { LlmWorkflowExecutor } from "../src/execution/llm-workflow-executor.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { KnowledgeLoader } from "../src/knowledge/loader.js";
import { KnowledgeSelector } from "../src/knowledge/selector.js";
import { MockLlmProvider } from "../src/llm/mock-provider.js";
import { PromptBuilder, PROMPT_VERSION } from "../src/prompting/prompt-builder.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const catalog = await new KnowledgeLoader().load();
const selection = new KnowledgeSelector().select(catalog, {
  text: "用户列表需要查询分页、新增编辑、停用删除和危险操作确认",
});
const context: WorkflowContext = {
  runId: "knowledge-prompt-test",
  startedAt: "2026-08-06T00:00:00.000Z",
  input: {
    sourcePath: "user-management.md",
    title: "用户管理",
    content: "# 用户管理\n\n用户列表需要查询分页、新增编辑、停用删除和危险操作确认。",
  },
  artifacts: {},
  knowledge: { catalog, selection },
};

test("TC-050-016: 不同阶段只注入必要知识类型", () => {
  const builder = new PromptBuilder();
  const analysis = builder.stageKnowledgeTrace("requirement-analysis", context)!;
  const prototype = builder.stageKnowledgeTrace("prototype", context)!;
  assert.ok(analysis.selectedKnowledge.every((item) => ["business", "rule"].includes(item.type)));
  assert.ok(prototype.selectedKnowledge.every((item) => ["component", "rule"].includes(item.type)));
  assert.ok(!prototype.selectedKnowledge.some((item) => item.type === "business"));
});

test("TC-050-017: Prompt 包含知识 ID、版本和约束且不泄漏无关知识", () => {
  const prompt = new PromptBuilder().buildStagePrompt("prototype", context);
  assert.equal(prompt.version, PROMPT_VERSION);
  assert.match(prompt.user, /component\.confirmation-dialog@1\.0\.0/);
  assert.match(prompt.user, /rule\.destructive-confirmation@1\.0\.0/);
  assert.match(prompt.user, /约束=requires-confirmation/);
  assert.doesNotMatch(prompt.user, /business\.base-data-management/);
  assert.doesNotMatch(prompt.user, /pattern\.list-page/);
});

test("TC-050-018: 阶段元数据记录选择来源、原因和知识版本", async () => {
  const builder = new PromptBuilder();
  const confirmationTrace = builder.stageKnowledgeTrace("prototype-confirmation", context);
  assert.equal(confirmationTrace?.knowledgeCatalogVersion, catalog.version);
  assert.deepEqual(confirmationTrace?.selectedKnowledge, []);

  const result = await new LlmWorkflowExecutor(
    new MockLlmProvider(),
    new MockStageExecutor(),
  ).execute("requirement-analysis", context);
  const item = result.generationMetadata?.knowledge?.selectedKnowledge[0];
  assert.ok(item?.version);
  assert.ok(item?.source);
  assert.ok(item?.reason);
});

test("TC-050-019/020: manifest 汇总知识使用且不包含 API Key", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v050-knowledge-prompt-"));
  const secret = "sk-test-never-persist-this-value";
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = secret;
  try {
    const workflow = new ProductDesignWorkflow(new LlmWorkflowExecutor(
      new MockLlmProvider(),
      new MockStageExecutor(),
    ));
    await workflow.run(context.input, output);
    const raw = await readFile(path.join(output, "manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as {
      knowledge: { knowledgeCatalogVersion: string; selectedKnowledge: Array<{ knowledgeId: string }> };
      stages: Array<{ generation?: { knowledge?: { selectedKnowledge: Array<{ source: string; reason: string; version: string }> } } }>;
    };
    assert.equal(manifest.knowledge.knowledgeCatalogVersion, catalog.version);
    assert.ok(manifest.knowledge.selectedKnowledge.length > 0);
    assert.ok(manifest.stages.some((stage) => (stage.generation?.knowledge?.selectedKnowledge.length ?? 0) > 0));
    assert.doesNotMatch(raw, new RegExp(secret));
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
