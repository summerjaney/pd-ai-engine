import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DeliveryConsistencyReport, DesignConsistencyReport, InteractionConsistencyReport, MasterGoData, PrdTraceabilityReport, PrototypeDsl, RequirementDesignContext, RequirementInteractionMap, RequirementPagePlan, PagePlanValidationReport } from "../src/domain/types.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { validateRequirementPagePlan } from "../src/planning/page-plan-validator.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";
import { validateDesignConsistency } from "../src/planning/design-consistency-validator.js";
import { validateInteractionConsistency } from "../src/planning/interaction-consistency-validator.js";
import { buildPrdTraceabilityReport } from "../src/planning/prd-traceability.js";
import { validateDeliveryConsistency } from "../src/planning/delivery-consistency-validator.js";
import { generateAcceptanceReport, runDeliveryCheck } from "../src/planning/delivery-check.js";

const test = (globalThis as any).test ?? (await import("node:test")).default;

test("TC-070-019: 真实用户管理需求生成对应六页面且页面规划闭环", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-user-management-"));
  const content = `# 基础平台用户管理

## 功能范围

- 支持新增、编辑、查看用户。
- 支持用户授权和批量导入。
- 支持启用、停用和批量停用。`;
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "user-management.md", title: "基础平台用户管理", content }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-070", requirementName: "user-management", revision: 1,
  });
  const prototype = await readJson<PrototypeDsl>(path.join(output, "06-prototype", "prototype.json"));
  const validation = await readJson<PagePlanValidationReport>(path.join(output, "05-page-plan", "validation-report.json"));
  assert.deepEqual(prototype.pages.map((page) => page.name), ["用户列表", "新增/编辑用户", "用户详情", "用户授权", "批量导入用户", "导入结果"]);
  assert.equal(validation.valid, true);
  assert.ok(prototype.rules.some((rule) => rule.id === "account-unique"));
  assert.ok(prototype.pages.find((page) => page.id === "P1-user-list")?.actions.some((action) => action.id === "batch-disable" && action.confirmation));
});

test("TC-070-017: CLI 交付检查服务可从需求目录重建并落盘一致性报告", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-check-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "1.0.0", requirementId: "REQ-070", requirementName: "user-management", revision: 1,
  });
  const checked = await runDeliveryCheck(output);
  assert.equal(checked.report.valid, true);
  assert.equal(checked.report.checks.masterGoSubmission, "PENDING");
  assert.match(await readFile(checked.markdownPath, "utf8"), /完整交付一致性报告/);
});

test("TC-070-018: 正式验收报告区分待画布验收与发布通过", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-acceptance-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "1.0.0", requirementId: "REQ-070", requirementName: "user-management", revision: 1,
  });
  const result = await generateAcceptanceReport(output);
  assert.equal(result.status, "PENDING");
  const content = await readFile(result.reportPath, "utf8");
  assert.match(content, /验收结论：PENDING/);
  assert.match(content, /待完成 MasterGo 真实画布验收/);
});

test("TC-070-021: 交付检查优先采用真实写入及逐页验收结果", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-real-write-check-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "1.0.0", requirementId: "REQ-070", requirementName: "user-management", revision: 1,
  });
  const data = await readJson<MasterGoData>(path.join(output, "07-mastergo", "mastergo-data.json"));
  await writeFile(path.join(output, "07-mastergo", "mastergo-write-result.json"), JSON.stringify({
    schemaVersion: "0.4", status: "PASS", completedAt: "2026-08-10T03:00:00.000Z", verificationRequired: false,
    pages: data.screens.map((screen) => ({ screenId: screen.id, screenName: screen.name, status: "VERIFIED" })),
  }));
  const checked = await runDeliveryCheck(output);
  assert.equal(checked.report.valid, true);
  assert.equal(checked.report.checks.masterGoSubmission, "PASS");
  assert.equal(checked.report.summary.createdPageCount, data.screens.length);
  assert.equal((await generateAcceptanceReport(output, checked.report)).status, "PASS");
});

test("TC-070-015: 工作流输出需求、原型、MasterGo 与 PRD 完整交付一致性报告", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-delivery-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "1.0.0", requirementId: "REQ-070", requirementName: "user-management", revision: 1,
  });
  const report = await readJson<DeliveryConsistencyReport>(path.join(output, "09-validation", "delivery-consistency-report.json"));
  const manifest = await readJson<{ deliveryConsistency: DeliveryConsistencyReport }>(path.join(output, "manifest.json"));
  assert.equal(report.schemaVersion, "0.7");
  assert.equal(report.requirementId, "REQ-070");
  assert.equal(report.valid, true);
  assert.equal(report.checks.prototypeToMasterGo, "PASS");
  assert.equal(report.checks.masterGoSubmission, "PENDING");
  assert.equal(report.checks.prototypeConfirmation, "PASS");
  assert.equal(report.checks.prdTraceability, "PASS");
  assert.deepEqual(manifest.deliveryConsistency, report);
});

test("TC-070-016: 完整交付检查识别 MasterGo 页面节点缺失和 PRD 追踪缺口", () => {
  const prototype: PrototypeDsl = {
    schemaVersion: "0.2", product: { name: "测试", description: "测试" }, navigation: [], transitions: [],
    pages: [{ id: "P1", name: "用户列表", route: "/users", pattern: "list", fields: [{ id: "name", label: "姓名", type: "text", required: true }], actions: [{ id: "create", label: "新建", kind: "primary" }] }],
    rules: [], designTokens: { colors: {}, spacing: {}, radius: {}, typography: { fontSize: {}, fontWeight: {}, lineHeight: {} } },
  };
  const data: MasterGoData = { schemaVersion: "0.2", product: prototype.product, tokens: { color: {}, spacing: {}, radius: {} }, screens: [{ id: "P1", name: "用户列表", route: "/users", pattern: "list", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] }] };
  const trace = buildPrdTraceabilityReport(prototype, "# PRD\n\n用户列表，路由 /users。\n");
  const report = validateDeliveryConsistency(prototype, { data, result: { schemaVersion: "0.2", createdPages: [], createdAt: new Date(0).toISOString(), status: "confirmed" } }, { status: "pending" }, trace);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "MASTERGO_NODE_MISMATCH"));
  assert.ok(report.issues.some((issue) => issue.code === "MASTERGO_PAGE_NOT_CREATED"));
  assert.ok(report.issues.some((issue) => issue.code === "PROTOTYPE_NOT_CONFIRMED"));
  assert.ok(report.issues.some((issue) => issue.code === "PRD_TRACEABILITY_GAP"));
});

test("TC-070-013: 工作流输出 PRD 页面、字段、规则和验收标准追踪矩阵", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-prd-trace-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "1.0.0", requirementId: "REQ-070", requirementName: "user-management", revision: 1,
  });
  const report = await readJson<PrdTraceabilityReport>(path.join(output, "09-validation", "prd-traceability.json"));
  assert.equal(report.schemaVersion, "0.7");
  assert.equal(report.requirementId, "REQ-070");
  assert.equal(report.valid, true);
  assert.ok(report.summary.pageCount > 0 && report.summary.fieldCount > 0 && report.summary.ruleCount > 0);
  assert.equal(report.summary.acceptanceCriteriaCount, report.summary.pageCount);
  assert.ok(report.items.every((item) => /^[A-Z]+-/.test(item.id)));
});

test("TC-070-014: PRD 追踪检查识别缺失页面字段、规则和验收覆盖", () => {
  const prototype: PrototypeDsl = {
    schemaVersion: "0.2", product: { name: "测试", description: "测试" }, navigation: [], transitions: [],
    pages: [{ id: "P1", name: "用户列表", route: "/users", pattern: "list", fields: [{ id: "name", label: "姓名", type: "text", required: true }], actions: [{ id: "create", label: "新建", kind: "primary" }] }],
    rules: [{ id: "unique-name", description: "用户名必须唯一。", appliesTo: ["name"] }],
    designTokens: { colors: {}, spacing: {}, radius: {}, typography: { fontSize: {}, fontWeight: {}, lineHeight: {} } },
  };
  const report = buildPrdTraceabilityReport(prototype, "# PRD\n\n用户列表，路由 /users。\n");
  assert.equal(report.valid, false);
  assert.ok(report.items.some((item) => item.kind === "field" && !item.prdCovered));
  assert.ok(report.items.some((item) => item.kind === "rule" && !item.prdCovered));
  assert.ok(report.items.some((item) => item.kind === "acceptance-criterion" && !item.prdCovered));
});

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

test("TC-070-001: 工作流输出需求级页面规划、设计上下文和交互图", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await workflow.run({
    sourcePath: "user-management.md",
    title: "用户管理",
    content: "# 用户管理\n\n管理员维护用户并配置权限。",
  }, output, {
    projectId: "base-platform",
    projectName: "基础平台",
    productVersion: "1.0.0",
    requirementId: "REQ-070",
    requirementName: "user-management",
    revision: 1,
  });

  const directory = path.join(output, "05-page-plan");
  const pagePlan = await readJson<RequirementPagePlan>(path.join(directory, "page-plan.json"));
  const designContext = await readJson<RequirementDesignContext>(path.join(directory, "design-context.json"));
  const interactionMap = await readJson<RequirementInteractionMap>(path.join(directory, "interaction-map.json"));
  const validation = await readJson<PagePlanValidationReport>(path.join(directory, "validation-report.json"));
  const consistency = await readJson<DesignConsistencyReport>(path.join(directory, "design-consistency-report.json"));

  assert.equal(pagePlan.schemaVersion, "0.7");
  assert.equal(pagePlan.requirementId, "REQ-070");
  assert.ok(pagePlan.pages.length > 0);
  assert.ok(pagePlan.pages.every((page) => page.status === "GENERATED"));
  assert.ok(pagePlan.pages.every((page) => page.id && page.name && page.route));
  assert.equal(designContext.frame.width, 1440);
  assert.deepEqual(designContext.tokens, (await readJson<any>(path.join(output, "06-prototype", "prototype.json"))).designTokens);
  assert.ok(interactionMap.interactions.length > 0);
  const pageIds = new Set(pagePlan.pages.map((page) => page.id));
  assert.ok(interactionMap.interactions.every((item) => item.sourcePageId === "global-navigation" || pageIds.has(item.sourcePageId)));
  assert.ok(interactionMap.interactions.every((item) => pageIds.has(item.targetPageId)));
  assert.equal(validation.summary.pageCount, pagePlan.pages.length);
  assert.equal(validation.summary.interactionCount, interactionMap.interactions.length);
  assert.equal(validation.valid, validation.summary.errorCount === 0);
  assert.equal(consistency.summary.pageCount, pagePlan.pages.length);
  assert.ok(consistency.pages.every((page) => page.frame.width === designContext.frame.width));
});

test("TC-070-005: 多页面共享同一设计上下文并完成规则检查", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-consistency-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" }, output);
  const report = await readJson<DesignConsistencyReport>(path.join(output, "05-page-plan", "design-consistency-report.json"));
  assert.equal(report.schemaVersion, "0.7");
  assert.equal(report.pages.length, report.summary.pageCount);
  assert.ok(report.pages.every((page) => page.conventions.formLabelWidth === 120));
  assert.equal(report.valid, true);
});

test("TC-070-006: 一致性检查识别字段冲突、危险操作和列表约定缺失", () => {
  const prototype: PrototypeDsl = {
    schemaVersion: "0.2", product: { name: "测试", description: "测试" }, navigation: [], rules: [], transitions: [],
    designTokens: { colors: {}, spacing: {}, radius: {}, typography: { fontSize: {}, fontWeight: {}, lineHeight: {} } },
    pages: [
      { id: "P1", name: "列表", route: "/list", pattern: "list", fields: [{ id: "status", label: "状态", type: "select", required: false }], actions: [{ id: "delete", label: "删除", kind: "danger" }] },
      { id: "P2", name: "详情", route: "/detail", pattern: "detail", fields: [{ id: "status", label: "状态说明", type: "text", required: false }], actions: [] },
    ],
  };
  const context: RequirementDesignContext = { schemaVersion: "0.7", frame: { width: 1440, height: 1024, layout: "horizontal", gap: 120 }, tokens: prototype.designTokens, conventions: { pageHeader: true, formLabelWidth: 120, primaryActionLimit: 1, destructiveActionRequiresConfirmation: true } };
  const report = validateDesignConsistency(prototype, context);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "FIELD_DEFINITION_CONFLICT"));
  assert.ok(report.issues.some((issue) => issue.code === "DANGER_ACTION_WITHOUT_CONFIRMATION"));
  assert.ok(report.issues.some((issue) => issue.code === "LIST_WITHOUT_PAGINATION"));
  assert.ok(report.issues.some((issue) => issue.code === "LIST_WITHOUT_EMPTY_STATE"));
});

test("TC-070-003: 页面规划校验识别重复 ID、孤立页面和无效目标页面", () => {
  const page = (id: string): RequirementPagePlan["pages"][number] => ({
    id, name: id, type: "list", objective: "测试", route: `/${id}`, upstreamPageIds: [], downstreamPageIds: [], triggerActions: [], roles: [], status: "GENERATED",
  });
  const plan: RequirementPagePlan = { schemaVersion: "0.7", pages: [page("P1"), page("P1"), page("P2")] };
  const interactions: RequirementInteractionMap = {
    schemaVersion: "0.7",
    interactions: [{ sourcePageId: "global-navigation", triggerType: "navigation", triggerId: "nav", triggerLabel: "进入", targetPageId: "P404" }],
  };
  const report = validateRequirementPagePlan(plan, interactions, []);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "DUPLICATE_PAGE_ID" && issue.pageId === "P1"));
  assert.ok(report.issues.some((issue) => issue.code === "INVALID_TARGET_PAGE" && issue.pageId === "P404"));
  assert.ok(report.issues.some((issue) => issue.code === "ISOLATED_PAGE" && issue.pageId === "P2"));
  assert.ok(report.issues.some((issue) => issue.code === "MISSING_FLOW_ENTRY"));
});

test("TC-070-004: 页面规划校验识别入口不可达页面和缺失业务流终点", () => {
  const page = (id: string): RequirementPagePlan["pages"][number] => ({
    id, name: id, type: "list", objective: "测试", route: `/${id}`, upstreamPageIds: [], downstreamPageIds: [], triggerActions: [], roles: [], status: "GENERATED",
  });
  const plan: RequirementPagePlan = { schemaVersion: "0.7", pages: [page("P1"), page("P2"), page("P3")] };
  const interactions: RequirementInteractionMap = { schemaVersion: "0.7", interactions: [
    { sourcePageId: "P1", triggerType: "action", triggerId: "to-p2", triggerLabel: "下一步", targetPageId: "P2" },
    { sourcePageId: "P2", triggerType: "action", triggerId: "to-p1", triggerLabel: "返回", targetPageId: "P1" },
    { sourcePageId: "P3", triggerType: "action", triggerId: "self", triggerLabel: "刷新", targetPageId: "P3" },
  ] };
  const navigation: PrototypeDsl["navigation"] = [{ label: "入口", pageId: "P1" }];
  const report = validateRequirementPagePlan(plan, interactions, navigation);
  assert.ok(report.issues.some((issue) => issue.code === "UNREACHABLE_PAGE" && issue.pageId === "P3"));
  assert.ok(report.issues.some((issue) => issue.code === "MISSING_FLOW_EXIT" && issue.severity === "warning"));
});

test("TC-070-002: 页面规划输出具有确定性且不存在重复页面", async () => {
  const input = { sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" };
  const first = await mkdtemp(path.join(os.tmpdir(), "pae-v070-a-"));
  const second = await mkdtemp(path.join(os.tmpdir(), "pae-v070-b-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, first);
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, second);
  const a = await readJson<RequirementPagePlan>(path.join(first, "05-page-plan", "page-plan.json"));
  const b = await readJson<RequirementPagePlan>(path.join(second, "05-page-plan", "page-plan.json"));
  assert.deepEqual(a, b);
  assert.equal(new Set(a.pages.map((page) => page.id)).size, a.pages.length);
});

test("TC-070-007: 工作流输出页面交互一致性报告", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-interaction-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" }, output);
  const report = await readJson<InteractionConsistencyReport>(path.join(output, "05-page-plan", "interaction-consistency-report.json"));
  assert.equal(report.schemaVersion, "0.7");
  assert.ok(report.summary.checkedPageCount > 0);
  assert.ok(report.summary.checkedInteractionCount > 0);
  assert.equal(report.valid, true);
});

test("TC-070-008: 交互检查识别无效触发器、冲突目标和规划关系偏差", () => {
  const prototype: PrototypeDsl = {
    schemaVersion: "0.2", product: { name: "测试", description: "测试" }, rules: [],
    designTokens: { colors: {}, spacing: {}, radius: {}, typography: { fontSize: {}, fontWeight: {}, lineHeight: {} } },
    navigation: [{ label: "列表", pageId: "P1" }],
    pages: [
      { id: "P1", name: "列表", route: "/list", pattern: "list", fields: [], actions: [{ id: "view", label: "查看", kind: "primary" }] },
      { id: "P2", name: "详情", route: "/detail", pattern: "detail", fields: [], actions: [] },
      { id: "P3", name: "编辑", route: "/edit", pattern: "form", fields: [], actions: [] },
    ], transitions: [],
  };
  const page = (id: string, downstreamPageIds: string[] = []): RequirementPagePlan["pages"][number] => ({
    id, name: id, type: "list", objective: "测试", route: `/${id}`, upstreamPageIds: [], downstreamPageIds, triggerActions: [], roles: [], status: "GENERATED",
  });
  const plan: RequirementPagePlan = { schemaVersion: "0.7", pages: [page("P1", ["P2"]), page("P2"), page("P3")] };
  const map: RequirementInteractionMap = { schemaVersion: "0.7", interactions: [
    { sourcePageId: "P1", triggerType: "action", triggerId: "missing", triggerLabel: "打开", targetPageId: "P2" },
    { sourcePageId: "P1", triggerType: "action", triggerId: "missing", triggerLabel: "打开", targetPageId: "P3" },
    { sourcePageId: "global-navigation", triggerType: "navigation", triggerId: "P404", triggerLabel: "错误入口", targetPageId: "P2" },
  ] };
  const report = validateInteractionConsistency(prototype, plan, map);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "MISSING_ACTION_TRIGGER"));
  assert.ok(report.issues.some((issue) => issue.code === "CONFLICTING_TRIGGER_TARGET"));
  assert.ok(report.issues.some((issue) => issue.code === "MISSING_NAVIGATION_TRIGGER"));
  assert.ok(report.issues.some((issue) => issue.code === "PLAN_RELATION_MISMATCH"));
});
