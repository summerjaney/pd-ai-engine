import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PrototypeDsl, StageExecutor } from "../src/domain/types.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { KnowledgeComplianceValidator } from "../src/knowledge/compliance-validator.js";
import { KnowledgeLoader } from "../src/knowledge/loader.js";
import { KnowledgeSelector } from "../src/knowledge/selector.js";
import { PromptBuilder } from "../src/prompting/prompt-builder.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const catalog = await new KnowledgeLoader().load();
const validator = new KnowledgeComplianceValidator();

const prototype = (): PrototypeDsl => ({
  schemaVersion: "0.2",
  product: { name: "用户管理", description: "管理用户状态" },
  navigation: [{ label: "用户管理", pageId: "list" }],
  pages: [
    { id: "list", name: "用户列表", route: "/users", pattern: "list", fields: [{ id: "status", label: "状态", type: "select", required: false }], actions: [{ id: "search", label: "查询", kind: "primary", roles: ["管理员"] }, { id: "reset", label: "重置", kind: "secondary", roles: ["管理员"] }, { id: "delete", label: "删除", kind: "danger", confirmation: true, confirmationMessage: "删除后无法恢复。", roles: ["管理员"] }], tableColumns: ["status"], pagination: { enabled: true, pageSize: 20 }, emptyState: { description: "暂无用户" } },
    { id: "form", name: "用户表单", route: "/users/new", pattern: "form", fields: [{ id: "name", label: "姓名", type: "text", required: true }], actions: [{ id: "save", label: "保存", kind: "primary", roles: ["管理员"] }] },
    { id: "detail", name: "用户详情", route: "/users/1", pattern: "detail", fields: [{ id: "status", label: "状态", type: "select", required: false }], actions: [] },
  ],
  rules: [], transitions: [],
  designTokens: { colors: {}, spacing: {}, radius: {}, typography: { fontSize: {}, fontWeight: {}, lineHeight: {} } },
});

const select = (text: string) => new KnowledgeSelector().select(catalog, { text });

test("TC-050-021: 必填字段规则校验 Prototype DSL", () => {
  const value = prototype();
  value.pages.find((page) => page.pattern === "form")!.fields[0].required = false;
  const result = validator.validatePrototype(value, catalog, select("表单字段必填校验"));
  assert.equal(result.valid, false);
  assert.match(validator.formatErrors(result), /rule\.required-field/);
});

test("TC-050-022: 状态规则同时校验列表页和详情页", () => {
  const value = prototype();
  value.pages.find((page) => page.pattern === "detail")!.fields = [];
  const result = validator.validatePrototype(value, catalog, select("流程状态列表详情"));
  assert.equal(result.valid, false);
  assert.match(validator.formatErrors(result), /用户详情/);
});

test("TC-050-023: 危险操作缺少确认机制时产生问题", () => {
  const value = prototype();
  value.pages[0].actions.find((action) => action.id === "delete")!.confirmation = false;
  const result = validator.validatePrototype(value, catalog, select("删除危险操作确认"));
  const issue = result.items.find((item) => item.knowledgeId === "rule.destructive-confirmation");
  assert.equal(issue?.status, "failed");
  assert.equal(result.valid, true, "warning 级规则不阻断，但必须进入问题矩阵");
});

test("PAE-050-001: 操作级权限缺失会被 error 规则阻断", () => {
  const value = prototype();
  delete value.pages[0].actions[0].roles;
  const result = validator.validatePrototype(value, catalog, select("用户权限角色列表管理"));
  const issue = result.items.find((item) => item.knowledgeId === "rule.permission-visibility");
  assert.equal(issue?.status, "failed");
  assert.equal(result.valid, false);
  assert.match(validator.formatErrors(result), /操作缺少角色权限/);
});

test("PAE-050-002: 列表查询与空状态结构可自动校验", () => {
  const value = prototype();
  value.pages[0].actions = value.pages[0].actions.filter((action) => action.id !== "reset");
  delete value.pages[0].emptyState;
  const result = validator.validatePrototype(value, catalog, select("用户列表查询重置空状态"));
  assert.equal(result.items.find((item) => item.knowledgeId === "rule.list-search")?.status, "failed");
  assert.equal(result.items.find((item) => item.knowledgeId === "rule.empty-state")?.status, "failed");
});

test("TC-050-024: error 级知识规则失败会阻断后续阶段", async () => {
  const fallback = new MockStageExecutor();
  const invalidExecutor: StageExecutor = {
    async execute(stage, context) {
      const result = await fallback.execute(stage, context);
      if (stage === "prototype") {
        const value = result.artifact as PrototypeDsl;
        for (const page of value.pages) if (page.pattern === "list" || page.pattern === "detail") page.fields = [];
      }
      return result;
    },
  };
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v050-block-"));
  await assert.rejects(
    new ProductDesignWorkflow(invalidExecutor).run({ sourcePath: "status.md", title: "状态", content: "# 状态管理\n\n流程状态列表详情必须展示状态。" }, output),
    /工作流执行失败/,
  );
  const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8"));
  assert.equal(manifest.stages.find((stage: { id: string }) => stage.id === "prototype").status, "failed");
  assert.equal(manifest.stages.find((stage: { id: string }) => stage.id === "prd").status, "skipped");
  assert.deepEqual(manifest.debugArtifacts, [
    "99-debug/prototype-compliance.json",
    "99-debug/prototype-rejected.json",
  ]);

  const rejected = JSON.parse(await readFile(path.join(output, "99-debug/prototype-rejected.json"), "utf8")) as PrototypeDsl;
  const rejectedStatusPages = rejected.pages.filter((page) => page.pattern === "list" || page.pattern === "detail");
  assert.ok(rejectedStatusPages.length > 0);
  assert.ok(rejectedStatusPages.every((page) => page.fields.length === 0));

  const compliance = JSON.parse(await readFile(path.join(output, "99-debug/prototype-compliance.json"), "utf8"));
  assert.equal(compliance.valid, false);
  assert.equal(
    compliance.items.find((item: { knowledgeId: string }) => item.knowledgeId === "rule.status-visible").status,
    "failed",
  );
});

test("TC-050-025: Review 输出知识合规矩阵", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v050-review-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "user.md", title: "用户管理", content: "# 用户管理\n\n用户列表和详情展示流程状态，表单字段必填，撤回危险操作需要确认。" }, output);
  const review = await readFile(path.join(output, "10-review.md"), "utf8");
  assert.match(review, /## 知识合规矩阵/);
  assert.match(review, /rule\.status-visible@1\.0\.0/);
  assert.match(review, /\| passed \|/);
});

test("TC-050-026: PRD 与 Prototype 使用相同版本的规则知识", () => {
  const selection = select("用户列表详情流程状态，表单字段必填，危险操作确认");
  const context = { runId: "consistency", startedAt: "2026-08-06T00:00:00Z", input: { sourcePath: "x.md", title: "x", content: "# x\n\n状态字段必填确认" }, artifacts: {}, knowledge: { catalog, selection } };
  const builder = new PromptBuilder();
  const prototypeRules = builder.stageKnowledgeTrace("prototype", context)!.selectedKnowledge.filter((item) => item.type === "rule");
  const prdRules = builder.stageKnowledgeTrace("prd", context)!.selectedKnowledge.filter((item) => item.type === "rule");
  assert.deepEqual(prdRules, prototypeRules);
});
