import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { PrototypeDsl } from "../src/domain/types.js";
import { MockStageExecutor, runReviewChecks } from "../src/execution/mock-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

test("完整运行 MVP 工作流并由 Prototype DSL 派生 PRD", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "测试产品",
    content: "# 测试产品\n\n创建并审批申请。",
  }, output);

  assert.equal(context.artifacts.prototype?.schemaVersion, "0.1");
  assert.match(context.artifacts.prd ?? "", /单一事实来源/);
  const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")) as { stages: unknown[] };
  assert.equal(manifest.stages.length, 8);
});

test("Prototype DSL 包含 6 个预期页面", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const prototype = context.artifacts.prototype;
  assert.ok(prototype, "Prototype DSL 必须存在");
  const expectedPageIds = [
    "request-list", "request-create", "request-detail",
    "approval-todo", "approval-detail", "leave-type-list",
  ];
  const actualPageIds = prototype.pages.map((p) => p.id);
  for (const id of expectedPageIds) {
    assert.ok(actualPageIds.includes(id), `页面 ${id} 必须存在于 Prototype DSL`);
  }
  assert.equal(actualPageIds.length, expectedPageIds.length, "页面数量应为 6 个");
});

test("申请详情字段不为空", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const detailPage = context.artifacts.prototype?.pages.find((p) => p.id === "request-detail");
  assert.ok(detailPage, "申请详情页面必须存在");
  assert.ok(detailPage.fields.length > 0, "申请详情字段不能为空");
  const fieldIds = detailPage.fields.map((f) => f.id);
  assert.ok(fieldIds.includes("requestNo"), "申请详情应包含申请编号");
  assert.ok(fieldIds.includes("applicant"), "申请详情应包含申请人");
  assert.ok(fieldIds.includes("status"), "申请详情应包含审批状态");
  assert.ok(fieldIds.includes("approvalHistory"), "申请详情应包含审批记录");
});

test("导航包含 3 个核心模块", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const nav = context.artifacts.prototype?.navigation;
  assert.ok(nav, "导航必须存在");
  const labels = nav.map((n) => n.label);
  assert.ok(labels.includes("申请管理"), "导航必须包含申请管理");
  assert.ok(labels.includes("审批工作台"), "导航必须包含审批工作台");
  assert.ok(labels.includes("基础设置"), "导航必须包含基础设置");
  assert.equal(nav.length, 3, "导航项数量应为 3 个");
});

test("角色名称与原始需求一致", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const reqAnalysis = context.artifacts["requirement-analysis"] ?? "";
  assert.ok(reqAnalysis.includes("员工"), "需求分析应包含'员工'角色");
  assert.ok(reqAnalysis.includes("部门负责人"), "需求分析应包含'部门负责人'角色");
  assert.ok(reqAnalysis.includes("人事管理员"), "需求分析应包含'人事管理员'角色");
  assert.ok(!reqAnalysis.includes("业务发起人"), "需求分析不应使用'业务发起人'");
  assert.ok(!reqAnalysis.includes("业务审批人"), "需求分析不应使用'业务审批人'");
  assert.ok(!reqAnalysis.includes("业务管理员"), "需求分析不应使用'业务管理员'");

  const nav = context.artifacts.prototype?.navigation ?? [];
  const allRoles = nav.flatMap((n) => n.roles ?? []);
  assert.ok(allRoles.includes("员工"), "导航角色应包含'员工'");
  assert.ok(allRoles.includes("部门负责人"), "导航角色应包含'部门负责人'");
  assert.ok(allRoles.includes("人事管理员"), "导航角色应包含'人事管理员'");
});

test("Review 能识别人为构造的页面缺失问题", () => {
  const incompletePrototype: PrototypeDsl = {
    schemaVersion: "0.1",
    product: { name: "测试", description: "测试" },
    navigation: [{ label: "申请管理", pageId: "request-list" }],
    pages: [
      {
        id: "request-list",
        name: "申请列表",
        route: "/requests",
        pattern: "list",
        fields: [],
        actions: [],
      },
    ],
    rules: [],
  };

  const issues = runReviewChecks(incompletePrototype);
  assert.ok(issues.length > 0, "Review 应发现页面缺失问题");

  const missingModuleIssue = issues.find((i) => i.type === "核心模块页面缺失");
  assert.ok(missingModuleIssue, "应发现核心模块页面缺失");

  const missingNavIssue = issues.find((i) => i.type === "导航缺失");
  assert.ok(missingNavIssue, "应发现导航缺失");

  const missingRoleIssue = issues.find((i) => i.type === "角色操作页面缺失");
  assert.ok(missingRoleIssue, "应发现角色操作页面缺失");
});

test("PRD 页面与 Prototype DSL 保持一致", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const prd = context.artifacts.prd ?? "";
  const prototype = context.artifacts.prototype;
  assert.ok(prototype, "Prototype DSL 必须存在");

  for (const page of prototype.pages) {
    assert.ok(prd.includes(page.name), `PRD 应包含页面 ${page.name}`);
    assert.ok(prd.includes(page.route), `PRD 应包含路由 ${page.route}`);
  }

  for (const rule of prototype.rules) {
    assert.ok(prd.includes(rule.description), `PRD 应包含规则 ${rule.description}`);
  }
});
