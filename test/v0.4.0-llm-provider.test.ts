import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LlmProvider, LlmGenerationRequest, LlmGenerationResponse } from "../src/llm/types.js";
import type { WorkflowContext } from "../src/domain/types.js";
import { loadLlmConfig } from "../src/llm/config.js";
import { MockLlmProvider } from "../src/llm/mock-provider.js";
import { OpenAiProvider } from "../src/llm/openai-provider.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { LlmRequirementAnalysisExecutor } from "../src/execution/llm-requirement-analysis-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";
import { PROMPT_VERSION } from "../src/prompting/prompt-builder.js";

const workflowContext = (): WorkflowContext => ({
  runId: "run",
  startedAt: "2026-07-31T00:00:00.000Z",
  input: {
    sourcePath: "requirement.md",
    title: "员工调动管理",
    content: "# 员工调动管理\n\n支持员工跨部门调动。",
  },
  artifacts: {},
});

test("TC-040-001/004/005 Mock 默认可用，CLI 配置覆盖环境变量，真实模式要求密钥", async () => {
  const config = loadLlmConfig({
    PAE_LLM_PROVIDER: "openai",
    PAE_LLM_MODEL: "env-model",
    PAE_LLM_API_KEY: "secret",
  }, { provider: "mock", model: "cli-model" });
  assert.equal(config.provider, "mock");
  assert.equal(config.model, "cli-model");
  assert.equal((await new MockLlmProvider().generate({
    stage: "requirement-analysis",
    systemPrompt: "system",
    userPrompt: "user",
  })).provider, "mock");
  const mockResult = await new LlmRequirementAnalysisExecutor(
    new MockLlmProvider(),
    new MockStageExecutor(),
  ).execute("requirement-analysis", workflowContext());
  assert.equal(mockResult.generationMetadata?.generationMode, "mock");
  assert.throws(
    () => loadLlmConfig({ PAE_LLM_PROVIDER: "openai", PAE_LLM_MODEL: "model" }),
    /PAE_LLM_API_KEY/,
  );
});

test("TC-040-022 PAE-040-001 默认超时为 180 秒并支持新旧环境变量", () => {
  assert.equal(loadLlmConfig({}).timeoutMs, 180_000);
  assert.equal(loadLlmConfig({ PAE_LLM_TIMEOUT_MS: "240000" }).timeoutMs, 240_000);
  assert.equal(loadLlmConfig({ PAE_LLM_TIMEOUT: "120000" }).timeoutMs, 120_000);
  assert.equal(loadLlmConfig({
    PAE_LLM_TIMEOUT_MS: "240000",
    PAE_LLM_TIMEOUT: "120000",
  }).timeoutMs, 240_000);
  assert.throws(() => loadLlmConfig({ PAE_LLM_TIMEOUT_MS: "0" }), /PAE_LLM_TIMEOUT_MS/);
  assert.throws(() => loadLlmConfig({ PAE_LLM_TIMEOUT_MS: "invalid" }), /PAE_LLM_TIMEOUT_MS/);
});

test("TC-040-003 OpenAI 响应转换为统一结果且请求使用配置", async () => {
  let requestBody = "";
  const provider = new OpenAiProvider({
    apiKey: "not-a-real-secret",
    model: "test-model",
    baseUrl: "https://example.invalid/v1",
    timeoutMs: 1000,
    fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({
        model: "resolved-model",
        choices: [{ message: { content: "# 需求分析\n\n有效正文" } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  const result = await provider.generate({
    stage: "requirement-analysis",
    systemPrompt: "system",
    userPrompt: "user",
  });
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "resolved-model");
  assert.equal(result.usage?.inputTokens, 12);
  assert.match(requestBody, /test-model/);
});

test("TC-040-013 无效结构触发一次自动重试并记录生成元数据", async () => {
  let calls = 0;
  const provider: LlmProvider = {
    async generate(_request: Readonly<LlmGenerationRequest>): Promise<LlmGenerationResponse> {
      calls++;
      return {
        content: calls === 1 ? "缺少标题" : "# 需求分析\n\n已修正。",
        model: "retry-model",
        provider: "openai",
      };
    },
    modelInfo: () => ({ id: "openai", model: "retry-model" }),
    healthCheck: async () => {},
  };
  const result = await new LlmRequirementAnalysisExecutor(
    provider,
    new MockStageExecutor(),
    1,
  ).execute("requirement-analysis", workflowContext());
  assert.equal(calls, 2);
  assert.equal(result.generationMetadata?.attempts, 2);
  assert.equal(result.generationMetadata?.validationStatus, "passed");
});

test("TC-040-006/021 manifest 记录生成信息但不包含 API Key", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v040-"));
  const secret = "sk-test-never-persist";
  const provider = new OpenAiProvider({
    apiKey: secret,
    model: "test-model",
    baseUrl: "https://example.invalid/v1",
    timeoutMs: 1000,
    fetch: (async () => new Response(JSON.stringify({
      model: "test-model",
      choices: [{ message: { content: "# 需求分析\n\n有效正文" } }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
  });
  const workflow = new ProductDesignWorkflow(new LlmRequirementAnalysisExecutor(
    provider,
    new MockStageExecutor(),
  ));
  await workflow.run(workflowContext().input, output);
  const manifest = await readFile(path.join(output, "manifest.json"), "utf8");
  assert.doesNotMatch(manifest, new RegExp(secret));
  assert.match(manifest, /"provider": "openai"/);
  assert.match(manifest, new RegExp(`"promptVersion": "${PROMPT_VERSION.replaceAll(".", "\\.")}"`));
});
