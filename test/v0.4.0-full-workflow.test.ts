import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmGenerationRequest, LlmGenerationResponse, LlmProvider } from "../src/llm/types.js";
import type { PrototypeDsl, StageId } from "../src/domain/types.js";
import { LlmWorkflowExecutor } from "../src/execution/llm-workflow-executor.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { OutputValidator } from "../src/validation/output-validator.js";
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
    actions: [
      { id: "search", label: "查询", kind: "primary", roles: ["管理员"] },
      { id: "reset", label: "重置", kind: "secondary", roles: ["管理员"] },
      { id: "create", label: "新建", kind: "primary", roles: ["管理员"] },
    ],
    tableColumns: ["status"],
    pagination: { enabled: true, pageSize: 20 },
    emptyState: { description: "暂无调动记录", actionId: "create" },
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

test("TC-040-025 PAE-040-002 Prototype 规则缺少 appliesTo 时按空数组校验", () => {
  const malformedPrototype = structuredClone(prototype) as PrototypeDsl & {
    rules: Array<{ id: string; description: string; appliesTo?: string[] }>;
  };
  delete malformedPrototype.rules[0].appliesTo;

  const result = new OutputValidator().validatePrototype(malformedPrototype as PrototypeDsl);

  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

class RecordingProvider implements LlmProvider {
  readonly requests: LlmGenerationRequest[] = [];

  async generate(request: Readonly<LlmGenerationRequest>): Promise<LlmGenerationResponse> {
    this.requests.push({ ...request });
    const content = request.stage === "prototype"
      ? JSON.stringify(prototype)
      : request.stage === "page-structure"
        ? "# 页面结构\n\n- 调动列表：展示状态，支持查询、重置和新建。"
        : request.stage === "prd"
          ? "# PRD\n\n## 调动列表\n\n字段：状态。\n\n操作：查询、重置、新建。"
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

test("TC-040-026 PAE-040-003 Prototype 连续两次结构无效时保存诊断文件且不含敏感信息", async () => {
  const secret = "sk-test-never-leak-pae-040-003";
  process.env.PAE_LLM_API_KEY = secret;
  try {
    const provider = new RecordingProvider();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      if (request.stage === "prototype") {
        provider.requests.push({ ...request });
        return {
          content: '{"schemaVersion":"0.2","pages":[]}',
          model: "integration-model",
          provider: "openai",
        };
      }
      return originalGenerate(request);
    };

    const output = await mkdtemp(path.join(os.tmpdir(), "pae-v040-debug-"));
    await assert.rejects(
      () => new ProductDesignWorkflow(new LlmWorkflowExecutor(
        provider,
        new MockStageExecutor(),
        1,
      )).run({
        sourcePath: "employee-transfer.md",
        title: "员工调动管理",
        content: "# 员工调动管理\n\n支持跨部门调动。",
      }, output),
      /工作流执行失败/,
    );

    const debug1Path = path.join(output, "99-debug", "prototype-attempt-1.json");
    const debug2Path = path.join(output, "99-debug", "prototype-attempt-2.json");
    const debug1Raw = await readFile(debug1Path, "utf8");
    const debug2Raw = await readFile(debug2Path, "utf8");
    const debug1 = JSON.parse(debug1Raw) as {
      stage: string;
      attempt: number;
      model: string;
      provider: string;
      rawResponse: string;
      parseSuccess: boolean;
      validationIssues: Array<{ code: string; message: string }>;
    };
    const debug2 = JSON.parse(debug2Raw) as typeof debug1;

    assert.equal(debug1.stage, "prototype");
    assert.equal(debug1.attempt, 1);
    assert.equal(debug1.model, "integration-model");
    assert.equal(debug1.provider, "openai");
    assert.equal(debug1.rawResponse, '{"schemaVersion":"0.2","pages":[]}');
    assert.equal(debug1.parseSuccess, true);
    assert.ok(debug1.validationIssues.length > 0, "attempt 1 诊断文件应包含 validation issues");

    assert.equal(debug2.stage, "prototype");
    assert.equal(debug2.attempt, 2);
    assert.equal(debug2.rawResponse, '{"schemaVersion":"0.2","pages":[]}');
    assert.ok(debug2.validationIssues.length > 0, "attempt 2 诊断文件应包含 validation issues");

    assert.ok(!debug1Raw.includes(secret), "attempt 1 诊断文件不得包含 API Key");
    assert.ok(!debug2Raw.includes(secret), "attempt 2 诊断文件不得包含 API Key");
    assert.ok(!debug1Raw.includes("Authorization"), "attempt 1 诊断文件不得包含 Authorization");
    assert.ok(!debug2Raw.includes("Authorization"), "attempt 2 诊断文件不得包含 Authorization");

    const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")) as {
      debugArtifacts: string[];
      stages: Array<{ id: string; status: string }>;
    };
    assert.ok(manifest.debugArtifacts.includes("99-debug/prototype-attempt-1.json"));
    assert.ok(manifest.debugArtifacts.includes("99-debug/prototype-attempt-2.json"));
    assert.equal(manifest.stages.find((s) => s.id === "prototype")?.status, "failed");
  } finally {
    delete process.env.PAE_LLM_API_KEY;
  }
});

test("TC-040-027 PAE-040-003 非标准字段被拒绝，重试携带字段约束后返回标准结构成功", async () => {
  // 真实模型常见错误：可解析 JSON、含页面，但使用 roles/groups/items/target_page 等非标准字段
  const malformedPrototype = {
    schemaVersion: "0.2",
    product: { name: "员工调动管理", description: "管理跨部门调动" },
    roles: ["申请人", "审批人"],
    navigation: [{ label: "调动管理", groups: ["transfer-list"] }],
    pages: [{
      id: "transfer-list",
      name: "调动列表",
      route: "/transfers",
      pattern: "list",
      items: [{ id: "status", label: "状态", type: "select", required: false }],
      actions: [{ id: "create", label: "新建", kind: "primary" }],
    }],
    rules: [{ id: "rule-1", description: "生效日期不得早于审批日期", applies_to: ["transfer-list"] }],
    transitions: [{
      source_page: "transfer-list",
      triggerType: "action",
      triggerId: "create",
      triggerLabel: "新建",
      target_page: "transfer-list",
    }],
    designTokens: {
      colors: { primary: "#1677ff" },
      spacing: { md: 16 },
      radius: { md: 6 },
      typography: { fontSize: { md: 14 }, fontWeight: { normal: 400 }, lineHeight: { md: 22 } },
    },
  };

  let prototypeCalls = 0;
  const provider = new RecordingProvider();
  const originalGenerate = provider.generate.bind(provider);
  provider.generate = async (request) => {
    if (request.stage === "prototype") {
      prototypeCalls++;
      provider.requests.push({ ...request });
      if (prototypeCalls === 1) {
        return { content: JSON.stringify(malformedPrototype), model: "integration-model", provider: "openai" };
      }
    }
    return originalGenerate(request);
  };

  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v040-fields-"));
  await new ProductDesignWorkflow(new LlmWorkflowExecutor(
    provider,
    new MockStageExecutor(),
    1,
  )).run({
    sourcePath: "employee-transfer.md",
    title: "员工调动管理",
    content: "# 员工调动管理\n\n支持跨部门调动。",
  }, output);

  // 第一次为错误字段结构，第二次为标准结构，工作流最终成功
  assert.equal(prototypeCalls, 2);

  const prototypeRequests = provider.requests.filter((r) => r.stage === "prototype");
  // 重试提示词必须重新附带 PrototypeDsl 字段约束
  assert.match(prototypeRequests[1].userPrompt, /PrototypeDsl JSON Schema 约束/);
  assert.match(prototypeRequests[1].userPrompt, /target_page/);
  assert.match(prototypeRequests[1].userPrompt, /不得使用 snake_case/);

  // 第一次校验错误应报告具体字段路径，不出现 undefined
  const firstAttemptErrors = prototypeRequests[1].userPrompt;
  assert.match(firstAttemptErrors, /navigation\[0\]\.pageId 缺失或为空/);
  assert.match(firstAttemptErrors, /pages\[0\]\.fields 缺失或不是数组/);
  assert.match(firstAttemptErrors, /transitions\[0\]\.sourcePageId 缺失或为空/);
  assert.match(firstAttemptErrors, /transitions\[0\]\.targetPageId 缺失或为空/);
  assert.match(firstAttemptErrors, /rules\[0\] 含有非标准字段 applies_to/);
  assert.ok(!/undefined 引用了 undefined/.test(firstAttemptErrors), "不得出现 undefined 引用 undefined 的误导信息");
  assert.ok(!/引用了不存在的页面：undefined/.test(firstAttemptErrors), "不得出现 undefined 页面引用");

  // 第二次返回标准结构后工作流成功
  const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")) as {
    status: string;
    stages: Array<{ id: string; status: string }>;
    debugArtifacts: string[];
  };
  assert.equal(manifest.status, "completed");
  assert.equal(manifest.stages.find((s) => s.id === "prototype")?.status, "completed");
  // 成功时不输出诊断文件
  assert.deepEqual(manifest.debugArtifacts, []);

  // 单独验证错误结构返回明确的字段结构错误
  const directValidation = new OutputValidator().validatePrototype(malformedPrototype as unknown as PrototypeDsl);
  assert.equal(directValidation.valid, false);
  assert.ok(directValidation.issues.some((i) => /navigation\[0\]\.pageId/.test(i.message)));
  assert.ok(directValidation.issues.some((i) => /pages\[0\]\.fields/.test(i.message)));
  assert.ok(directValidation.issues.some((i) => /transitions\[0\]\.sourcePageId/.test(i.message)));
  assert.ok(directValidation.issues.some((i) => /transitions\[0\]\.targetPageId/.test(i.message)));
  assert.ok(directValidation.issues.some((i) => /applies_to/.test(i.message)));
  assert.ok(!directValidation.issues.some((i) => /undefined/.test(i.message)));
});

test("TC-040-028 PAE-040-004 manifest.version 与根 package.json.version 完全一致", async () => {
  const rootPackageJson = JSON.parse(
    await readFile(path.resolve(process.cwd(), "package.json"), "utf8"),
  ) as { version: string };

  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v040-version-"));
  await new ProductDesignWorkflow(new LlmWorkflowExecutor(
    new RecordingProvider(),
    new MockStageExecutor(),
    1,
  )).run({
    sourcePath: "employee-transfer.md",
    title: "员工调动管理",
    content: "# 员工调动管理\n\n支持跨部门调动。",
  }, output);

  const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")) as {
    version: string;
  };
  assert.equal(manifest.version, rootPackageJson.version);
  assert.notEqual(manifest.version, "0.3.1");
});
