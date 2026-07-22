import assert from "node:assert/strict";
import { access, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { MasterGoData, PrototypeBundleManifest, PrototypeDsl } from "../src/domain/types.js";
import { MockStageExecutor, runReviewChecks } from "../src/execution/mock-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";
import { prepareRequirementOutput } from "../src/output/requirement-output.js";

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

test("按项目和需求创建成果物目录且不同需求互不覆盖", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-output-"));
  const input = { sourcePath: "requirement.md", title: "请假管理", content: "# 请假管理\n" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "人力资源管理系统",
    productVersion: "1.0.0",
    revision: 1,
  };
  const first = await prepareRequirementOutput({ ...base, requirementId: "REQ-001", requirementName: "leave-request" }, input);
  const second = await prepareRequirementOutput({ ...base, requirementId: "REQ-002", requirementName: "role-permission" }, input);
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await workflow.run(input, first.requirementDirectory, first.context);
  await workflow.run(input, second.requirementDirectory, second.context);

  assert.notEqual(first.requirementDirectory, second.requirementDirectory);
  assert.equal((await readJson<{ projectId: string }>(path.join(outputRoot, "hr-system", "project.json"))).projectId, "hr-system");
  assert.equal((await readJson<{ requirementId: string }>(path.join(first.requirementDirectory, "requirement.json"))).requirementId, "REQ-001");
  assert.equal((await readJson<{ requirement?: { requirementId: string } }>(path.join(first.requirementDirectory, "manifest.json"))).requirement?.requirementId, "REQ-001");
  await access(path.join(first.requirementDirectory, "09-prd.md"));
  await access(path.join(second.requirementDirectory, "09-prd.md"));
});

test("完整运行 MVP 工作流并由 Prototype DSL 派生 PRD", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "测试产品",
    content: "# 测试产品\n\n创建并审批申请。",
  }, output);

  assert.equal(context.artifacts.prototype?.schemaVersion, "0.2");
  assert.match(context.artifacts.prd ?? "", /06-prototype\//);
  assert.match(context.artifacts.prd ?? "", /07-mastergo\//);
  const manifest = await readJson<{ stages: Array<{ id: string; type: string; files?: string[] }> }>(path.join(output, "manifest.json"));
  assert.equal(manifest.stages.length, 10);
  const prototypeStage = manifest.stages.find((stage) => stage.id === "prototype");
  assert.ok(prototypeStage, "manifest 中必须存在 prototype 阶段");
  assert.equal(prototypeStage.type, "directory");
  assert.ok(prototypeStage.files?.includes("06-prototype/prototype.html"), "manifest 应记录 prototype.html");
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
    schemaVersion: "0.2",
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
    transitions: [],
    designTokens: {
      colors: {},
      spacing: {},
      radius: {},
      typography: { fontSize: {}, fontWeight: {}, lineHeight: {} },
    },
  };

  const issues = runReviewChecks(incompletePrototype);
  assert.ok(issues.length > 0, "Review 应发现页面缺失问题");

  const missingModuleIssue = issues.find((i) => i.type === "核心模块页面缺失");
  assert.ok(missingModuleIssue, "应发现核心模块页面缺失");

  const missingNavIssue = issues.find((i) => i.type === "导航缺失");
  assert.ok(missingNavIssue, "应发现导航缺失");

  const missingRoleIssue = issues.find((i) => i.type === "角色操作页面缺失");
  assert.ok(missingRoleIssue, "应发现角色操作页面缺失");

  const missingMasterGoIssue = issues.find((i) => i.type === "MasterGo 原型数据缺失");
  assert.ok(missingMasterGoIssue, "应发现 MasterGo 原型数据缺失");

  const notConfirmedIssue = issues.find((i) => i.type === "原型未确认");
  assert.ok(notConfirmedIssue, "应发现原型未确认");
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

  assert.ok(prd.includes("06-prototype/"), "PRD 应引用原型目录");
  assert.ok(prd.includes("07-mastergo/"), "PRD 应引用 MasterGo 目录");
});

test("Prototype Bundle 输出目录包含 HTML、manifest、MasterGo 数据和预览图", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const prototype = context.artifacts.prototype;
  assert.ok(prototype, "Prototype DSL 必须存在");

  const bundleDir = path.join(output, "06-prototype");
  const dsl = await readJson<PrototypeDsl>(path.join(bundleDir, "prototype.json"));
  const bundleManifest = await readJson<PrototypeBundleManifest>(path.join(bundleDir, "prototype-manifest.json"));
  const masterGoData = await readJson<MasterGoData>(path.join(bundleDir, "mastergo-data.json"));
  const html = await readFile(path.join(bundleDir, "prototype.html"), "utf8");
  const previewFiles = await readdir(path.join(bundleDir, "preview"));

  assert.equal(dsl.schemaVersion, "0.2");
  assert.equal(bundleManifest.entry, "prototype.html");
  assert.equal(bundleManifest.pages.length, prototype.pages.length);
  assert.equal(masterGoData.screens.length, prototype.pages.length);
  assert.equal(previewFiles.length, prototype.pages.length);
  assert.match(html, /Prototype DSL \+ 可交互 HTML \+ MasterGo 适配数据/);
  assert.match(html, /data-target-page="request-list"/);
  assert.match(html, /新建申请/);
});

test("Prototype manifest 和 MasterGo 数据包含页面跳转关系", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const bundleDir = path.join(output, "06-prototype");
  const bundleManifest = await readJson<PrototypeBundleManifest>(path.join(bundleDir, "prototype-manifest.json"));
  const masterGoData = await readJson<MasterGoData>(path.join(bundleDir, "mastergo-data.json"));

  const createTransition = bundleManifest.transitions.find((transition) =>
    transition.sourcePageId === "request-list" && transition.triggerId === "create"
  );
  assert.ok(createTransition, "manifest 应包含从申请列表到新建申请的跳转");
  assert.equal(createTransition.targetPageId, "request-create");

  const approvalScreen = masterGoData.screens.find((screen) => screen.id === "approval-detail");
  assert.ok(approvalScreen, "MasterGo 数据必须包含审批详情页面");
  assert.ok(
    approvalScreen.interactions.some((transition) => transition.triggerId === "approve" && transition.targetPageId === "approval-todo"),
    "审批详情应声明审批后返回待办列表的交互",
  );
});

test("重复运行会清理旧版 prototype 单文件产物", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  await writeFile(path.join(output, "06-prototype.json"), "{\"legacy\":true}\n", "utf8");

  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const manifest = await readJson<{ stages: Array<{ id: string }> }>(path.join(output, "manifest.json"));
  const stageIds = manifest.stages.map((stage) => stage.id);

  assert.ok(stageIds.includes("prototype"), "运行后仍应包含 prototype 阶段");
  await assert.rejects(readFile(path.join(output, "06-prototype.json"), "utf8"));
});

test("工作流包含 10 个阶段", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const manifest = await readJson<{ stages: Array<{ id: string }> }>(path.join(output, "manifest.json"));
  const stageIds = manifest.stages.map((stage) => stage.id);

  assert.equal(stageIds.length, 10, "工作流应包含 10 个阶段");
  assert.ok(stageIds.includes("mastergo"), "工作流应包含 mastergo 阶段");
  assert.ok(stageIds.includes("prototype-confirmation"), "工作流应包含 prototype-confirmation 阶段");

  const expectedOrder = [
    "requirement-analysis",
    "product-outline",
    "product-architecture",
    "core-flow",
    "page-structure",
    "prototype",
    "mastergo",
    "prototype-confirmation",
    "prd",
    "review",
  ];
  assert.deepEqual(stageIds, expectedOrder, "阶段顺序应符合预期");
});

test("mastergo 阶段生成数据文件", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const mastergo = context.artifacts.mastergo;
  assert.ok(mastergo, "mastergo 产物必须存在");
  assert.ok(mastergo.data, "mastergo 数据必须存在");
  assert.ok(mastergo.result, "mastergo 结果必须存在");
  assert.equal(mastergo.data.schemaVersion, "0.2");
  assert.equal(mastergo.result.schemaVersion, "0.2");
  assert.equal(mastergo.data.screens.length, 6, "MasterGo 屏幕数量应为 6 个");

  const mastergoDir = path.join(output, "07-mastergo");
  const mastergoData = await readJson<MasterGoData>(path.join(mastergoDir, "mastergo-data.json"));
  const mastergoResult = await readJson<{ createdPages: Array<{ pageId: string; pageName: string; nodeId: string }> }>(path.join(mastergoDir, "mastergo-result.json"));

  assert.equal(mastergoData.screens.length, 6);
  assert.equal(mastergoResult.createdPages.length, 6);
});

test("prototype-confirmation 阶段生成确认状态", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const confirmation = context.artifacts["prototype-confirmation"];
  assert.ok(confirmation, "原型确认产物必须存在");
  assert.equal(confirmation.status, "confirmed", "原型确认状态应为 confirmed");
  assert.ok(confirmation.confirmedAt, "应包含确认时间");
  assert.ok(confirmation.confirmedBy, "应包含确认人");

  const confirmationFile = await readJson<{ status: string }>(path.join(output, "08-prototype-confirmation.json"));
  assert.equal(confirmationFile.status, "confirmed");
});

test("Prototype DSL 包含 transitions 和 designTokens", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "requirement.md",
    title: "员工请假管理",
    content: "# 员工请假管理\n\n员工请假申请和审批。",
  }, output);

  const prototype = context.artifacts.prototype;
  assert.ok(prototype, "Prototype DSL 必须存在");
  assert.ok(prototype.transitions, "必须包含 transitions");
  assert.ok(prototype.transitions.length > 0, "transitions 不能为空");
  assert.ok(prototype.designTokens, "必须包含 designTokens");
  assert.ok(Object.keys(prototype.designTokens.colors).length > 0, "designTokens.colors 不能为空");
});

test("Review 检查 MasterGo 屏幕数量与 DSL 页面数量一致", () => {
  const prototype: PrototypeDsl = {
    schemaVersion: "0.2",
    product: { name: "测试", description: "测试" },
    navigation: [
      { label: "申请管理", pageId: "request-list", roles: ["员工"] },
      { label: "审批工作台", pageId: "approval-todo", roles: ["部门负责人"] },
      { label: "基础设置", pageId: "leave-type-list", roles: ["人事管理员"] },
    ],
    pages: [
      { id: "request-list", name: "申请列表", route: "/requests", pattern: "list", fields: [], actions: [] },
      { id: "request-create", name: "新建申请", route: "/requests/new", pattern: "form", fields: [], actions: [] },
    ],
    rules: [],
    transitions: [],
    designTokens: {
      colors: { primary: "#3B82F6" },
      spacing: { s16: 16 },
      radius: { r12: 12 },
      typography: { fontSize: { sm: 14 }, fontWeight: { normal: 400 }, lineHeight: { sm: 20 } },
    },
  };

  const mastergo = {
    data: {
      schemaVersion: "0.2",
      product: prototype.product,
      tokens: { color: {}, spacing: {}, radius: {} },
      screens: [
        { id: "request-list", name: "申请列表", route: "/requests", pattern: "list", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] },
      ],
    },
    result: {
      schemaVersion: "0.2",
      createdPages: [{ pageId: "request-list", pageName: "申请列表", nodeId: "mg-request-list" }],
      createdAt: new Date().toISOString(),
      status: "pending",
    },
  };

  const issues = runReviewChecks(prototype, mastergo, { status: "confirmed" });
  const screenCountIssue = issues.find((i) => i.type === "MasterGo 屏幕数量不一致");
  assert.ok(screenCountIssue, "应发现 MasterGo 屏幕数量不一致");
});

test("连续创建 REQ-001、REQ-002 后，索引同时包含两条记录", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-index-test-"));
  const input = { sourcePath: "requirement.md", title: "请假管理", content: "# 请假管理\n" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "人力资源管理系统",
    productVersion: "1.0.0",
    revision: 1,
  };

  await prepareRequirementOutput({ ...base, requirementId: "REQ-001", requirementName: "leave-request" }, input);
  await prepareRequirementOutput({ ...base, requirementId: "REQ-002", requirementName: "overtime-request" }, input);

  const indexPath = path.join(outputRoot, "hr-system", "product", "requirement-index.md");
  const indexContent = await readFile(indexPath, "utf8");

  assert.ok(indexContent.includes("REQ-001"), "索引应包含 REQ-001");
  assert.ok(indexContent.includes("leave-request"), "索引应包含 leave-request");
  assert.ok(indexContent.includes("REQ-002"), "索引应包含 REQ-002");
  assert.ok(indexContent.includes("overtime-request"), "索引应包含 overtime-request");

  const req001Count = (indexContent.match(/\| REQ-001 \|/g) ?? []).length;
  const req002Count = (indexContent.match(/\| REQ-002 \|/g) ?? []).length;
  assert.equal(req001Count, 1, "REQ-001 应只出现一次");
  assert.equal(req002Count, 1, "REQ-002 应只出现一次");
});

test("同一需求重复运行后，索引中仍只有一条记录", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-index-dup-"));
  const input = { sourcePath: "requirement.md", title: "请假管理", content: "# 请假管理\n" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "人力资源管理系统",
    productVersion: "1.0.0",
    revision: 1,
  };

  await prepareRequirementOutput({ ...base, requirementId: "REQ-001", requirementName: "leave-request" }, input);
  await prepareRequirementOutput({ ...base, requirementId: "REQ-001", requirementName: "leave-request" }, input);

  const indexPath = path.join(outputRoot, "hr-system", "product", "requirement-index.md");
  const indexContent = await readFile(indexPath, "utf8");

  const req001Count = (indexContent.match(/\| REQ-001 \|/g) ?? []).length;
  assert.equal(req001Count, 1, "同一需求在索引中应只有一行");
});

test("索引包含需求编号、名称、产品版本和状态", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-index-fields-"));
  const input = { sourcePath: "requirement.md", title: "请假管理", content: "# 请假管理\n" };

  await prepareRequirementOutput({
    outputRoot,
    projectId: "hr-system",
    projectName: "人力资源管理系统",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
    revision: 1,
  }, input);

  const indexPath = path.join(outputRoot, "hr-system", "product", "requirement-index.md");
  const indexContent = await readFile(indexPath, "utf8");

  assert.ok(indexContent.includes("| 需求编号 |"), "索引表头应包含需求编号");
  assert.ok(indexContent.includes("| 需求名称 |"), "索引表头应包含需求名称");
  assert.ok(indexContent.includes("| 产品版本 |"), "索引表头应包含产品版本");
  assert.ok(indexContent.includes("| 状态 |"), "索引表头应包含状态");

  assert.ok(/\| REQ-001 \| leave-request \| 1\.0\.0 \| created \|/.test(indexContent),
    "索引行应包含需求编号、名称、产品版本和状态");
});
