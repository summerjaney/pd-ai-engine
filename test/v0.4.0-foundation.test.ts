import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowContext } from "../src/domain/types.js";
import { PromptBuilder, PROMPT_VERSION } from "../src/prompting/prompt-builder.js";
import { OutputValidator } from "../src/validation/output-validator.js";

const context = (artifacts: WorkflowContext["artifacts"] = {}): WorkflowContext => ({
  runId: "test-run",
  startedAt: "2026-07-31T00:00:00.000Z",
  input: {
    sourcePath: "requirement.md",
    title: "员工调动管理",
    content: "# 员工调动管理\n\n支持员工发起跨部门调动申请。",
  },
  artifacts,
});

test("v0.4.0 PromptBuilder 注入原始需求和前序成果物", () => {
  const prompt = new PromptBuilder().buildStagePrompt("product-outline", context({
    "requirement-analysis": "# 需求分析\n\n涉及员工与审批人。",
  }));
  assert.equal(prompt.version, PROMPT_VERSION);
  assert.match(prompt.user, /员工调动管理/);
  assert.match(prompt.user, /涉及员工与审批人/);
});

test("v0.4.0 OutputValidator 拒绝空输出和无标题 Markdown", () => {
  const validator = new OutputValidator();
  assert.equal(validator.validateText("").valid, false);
  assert.equal(validator.validateText("只有正文").valid, false);
  assert.equal(validator.validateText("# 有效成果物\n\n正文").valid, true);
});

test("v0.4.0 OutputValidator 校验阶段依赖", () => {
  const validator = new OutputValidator();
  const missing = validator.validateDependencies("prd", context());
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.issues.map((issue) => issue.message), [
    "prd 缺少前置成果物：prototype",
    "prd 缺少前置成果物：prototype-confirmation",
  ]);

  const complete = validator.validateDependencies("prd", context({
    prototype: {} as never,
    "prototype-confirmation": { status: "confirmed" },
  }));
  assert.equal(complete.valid, true);
});
