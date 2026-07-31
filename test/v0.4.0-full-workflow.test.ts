import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmGenerationRequest, LlmGenerationResponse, LlmProvider } from "../src/llm/types.js";
import type { PrototypeDsl, StageId } from "../src/domain/types.js";
import { LlmWorkflowExecutor } from "../src/execution/llm-workflow-executor.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const prototype: PrototypeDsl = {
  schemaVersion: "0.2",
  product: { name: "员工调动管理", description: "管理员工跨部门调动" },
  navigation: [{ label: "调动管理", pageId: "transfer-list" }],
  pages: [{
    id: "transfer-list",
    name: "调动列表",
    route: "/transfers",
    pattern: "list",
    fields: [{ id: "status", label: "状态", type: "select", required: false }],
    actions: [{ id: "create", label: "新建", kind: "primary" }],
  }],
  rules: [{ id: "rule-1", description: "生效日期不得早于审批日期", appliesTo: ["transfer-list"] }],
  transitions: [],
  designTokens: {
    colors: { primary: "#1677ff" },
    spacing: { md: 16 },
    radius: { md: 6 },
    typography: {
      fontSize: { md: 14 },
      fontWeight: { normal: 400 },
      lineHeight: { md: 22 },
    },
  },
};

class RecordingProvider implements LlmProvider {
  readonly requests: LlmGenerationRequest[] = [];

  async generate(request: Readonly<LlmGenerationRequest>): Promise<LlmGenerationResponse> {
    this.requests.push({ ...request });
    const content = request.stage === "prototype"
      ? JSON.stringify(prototype)
      : request.stage === "page-structure"
        ? "# 页面结构\n\n- 调动列表：展示状态，支持新建。"
        : request.stage === "prd"
          ? "# PRD\n\n## 调动列表\n\n字段：状态。\n\n操作：新建。"
      : `# ${request.stage}\n\n这是 ${request.stage} 的有效成果物。`;
    return { content, model: "integration-model", provider: "openai" };
  }

  modelInfo() {
    return { id: "openai" as const, model: "integration-model" };
  }

  async healthCheck(): Promise<void> {}
}

test("TC-040-007~012 真实 Provider 完成全工作流并按阶段传递必要上下文", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v040-full-"));
  const provider = new RecordingProvider();
  const workflow = new ProductDesignWorkflow(new LlmWorkflowExecutor(
    provider,
    new MockStageExecutor(),
  ));

  await workflow.run({
    sourcePath: "employee-transfer.md",
    title: "员工调动管理",
    content: "# 员工调动管理\n\n支持跨部门调动申请、审批和生效。",
  }, output);

  const generatedStages = provider.requests.map((request) => request.stage);
  assert.deepEqual(generatedStages, [
    "requirement-analysis",
    "product-outline",
    "product-architecture",
    "core-flow",
    "page-structure",
    "prototype",
    "prd",
    "review",
  ] satisfies StageId[]);

  const prdRequest = provider.requests.find((request) => request.stage === "prd");
  assert.match(prdRequest?.userPrompt ?? "", /"schemaVersion": "0.2"/);
  assert.match(prdRequest?.userPrompt ?? "", /prototype-confirmation/);
  assert.doesNotMatch(prdRequest?.userPrompt ?? "", /## mastergo/);

  const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")) as {
    stages: Array<{ id: StageId; generation?: { provider: string } }>;
  };
  assert.equal(manifest.stages.length, 10);
  assert.ok(manifest.stages.every((stage) => stage.generation?.provider === "openai"));
  assert.equal(JSON.parse(await readFile(path.join(output, "06-prototype/prototype.json"), "utf8")).product.name, "员工调动管理");
});

test("TC-040-013 非法 Prototype DSL 会携带校验错误重试", async () => {
  let prototypeCalls = 0;
  const provider = new RecordingProvider();
  const originalGenerate = provider.generate.bind(provider);
  provider.generate = async (request) => {
    if (request.stage === "prototype" && prototypeCalls++ === 0) {
      provider.requests.push({ ...request });
      return { content: "{\"schemaVersion\":\"0.2\"}", model: "integration-model", provider: "openai" };
    }
    return originalGenerate(request);
  };

  const workflow = new ProductDesignWorkflow(new LlmWorkflowExecutor(
    provider,
    new MockStageExecutor(),
    1,
  ));
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v040-retry-"));
  await workflow.run({
    sourcePath: "employee-transfer.md",
    title: "员工调动管理",
    content: "# 员工调动管理\n\n支持跨部门调动。",
  }, output);

  const prototypeRequests = provider.requests.filter((request) => request.stage === "prototype");
  assert.equal(prototypeRequests.length, 2);
  assert.match(prototypeRequests[1].userPrompt, /上次输出校验错误/);
});

test("TC-040-014~016 跨成果物不一致会被识别并自动修正", async () => {
  let prdCalls = 0;
  const provider = new RecordingProvider();
  const originalGenerate = provider.generate.bind(provider);
  provider.generate = async (request) => {
    if (request.stage === "prd" && prdCalls++ === 0) {
      provider.requests.push({ ...request });
      return { content: "# PRD\n\n这里遗漏了原型明细。", model: "integration-model", provider: "openai" };
    }
    return originalGenerate(request);
  };

  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v040-consistency-"));
  await new ProductDesignWorkflow(new LlmWorkflowExecutor(
    provider,
    new MockStageExecutor(),
    1,
  )).run({
    sourcePath: "employee-transfer.md",
    title: "员工调动管理",
    content: "# 员工调动管理\n\n支持跨部门调动。",
  }, output);

  const prdRequests = provider.requests.filter((request) => request.stage === "prd");
  assert.equal(prdRequests.length, 2);
  assert.match(prdRequests[1].userPrompt, /调动列表/);
  assert.match(prdRequests[1].userPrompt, /状态/);
  assert.match(prdRequests[1].userPrompt, /新建/);
});

test("TC-040-018 工作流失败时 manifest 标记失败并跳过后续阶段", async () => {
  const provider = new RecordingProvider();
  provider.generate = async (request) => {
    provider.requests.push({ ...request });
    if (request.stage === "product-outline") throw new Error("rate limit: request throttled");
    return { content: "# 有效成果物\n\n正文", model: "integration-model", provider: "openai" };
  };
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v040-failure-"));
  await assert.rejects(
    () => new ProductDesignWorkflow(new LlmWorkflowExecutor(
      provider,
      new MockStageExecutor(),
    )).run({
      sourcePath: "employee-transfer.md",
      title: "员工调动管理",
      content: "# 员工调动管理\n\n支持跨部门调动。",
    }, output),
    /工作流执行失败/,
  );

  const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")) as {
    status: string;
    finishedAt: string;
    stages: Array<{ id: StageId; status: string }>;
  };
  assert.equal(manifest.status, "failed");
  assert.ok(manifest.finishedAt);
  assert.equal(manifest.stages.find((stage) => stage.id === "product-outline")?.status, "failed");
  assert.equal(manifest.stages.find((stage) => stage.id === "product-architecture")?.status, "skipped");
});
