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

test("TC-050-017A: Prototype Prompt 将知识断言翻译为可执行的逐页约束", () => {
  const prompt = new PromptBuilder().buildStagePrompt("prototype", context);
  assert.match(prompt.user, /每一个 pattern 为 list 或 detail 的页面/);
  assert.match(prompt.user, /字段 id 优先使用 status/);
  assert.match(prompt.user, /每一个 kind 为 danger 的操作/);
  assert.match(prompt.user, /confirmation: true/);
  assert.match(prompt.user, /confirmationMessage/);
  assert.match(prompt.user, /action 都必须填写非空 roles/);
  assert.match(prompt.user, /id=search/);
  assert.match(prompt.user, /tableColumns/);
  assert.match(prompt.user, /optionsSource/);
  assert.match(prompt.user, /errorFeedback/);
  assert.match(prompt.user, /完整列出所有 required: true/);
  assert.match(prompt.user, /不能只写在 rules\.description 中/);
});

test("PAE-050-004: PRD Prompt 保留未闭环待确认项", () => {
  const prompt = new PromptBuilder().buildStagePrompt("prd", {
    ...context,
    artifacts: {
      "requirement-analysis": "# 需求分析\n\n## 待确认项\n\n- 组织管理员是否允许停用用户：待确认。",
      prototype: {
        schemaVersion: "0.2",
        product: { name: "用户管理", description: "管理用户" },
        navigation: [], pages: [], rules: [], transitions: [],
        designTokens: { colors: {}, spacing: {}, radius: {}, typography: { fontSize: {}, fontWeight: {}, lineHeight: {} } },
      },
      "prototype-confirmation": { status: "pending" },
    },
  });
  assert.match(prompt.system, /待确认项闭环说明/);
  assert.match(prompt.system, /待确认\/TBD/);
  assert.match(prompt.user, /组织管理员是否允许停用用户：待确认/);
});

test("PAE-050-004: Prototype Prompt 禁止待确认项污染异常反馈", () => {
  const prompt = new PromptBuilder().buildStagePrompt("prototype", {
    ...context,
    artifacts: {
      "requirement-analysis": [
        "# 需求分析",
        "",
        "## 待确认项",
        "",
        "- 手机号是否需要强制格式校验：待确认。",
      ].join("\n"),
      "page-structure": "# 页面结构\n\n- 用户列表\n- 用户表单",
    },
  });
  assert.match(prompt.system, /字段校验、异常反馈、操作影响、规则描述/);
  assert.match(prompt.system, /待确认\/TBD/);
  assert.match(prompt.user, /手机号是否需要强制格式校验：待确认/);
  assert.match(prompt.user, /不得写入 validationMessage、operationFailureMessage 或 recoveryAction 作为已生效事实/);
  assert.match(prompt.user, /通用提示/);
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
