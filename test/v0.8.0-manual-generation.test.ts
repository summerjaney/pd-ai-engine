import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { generateManuals } from "../src/manual/generator.js";
import { generateManualDelivery, updateManualDelivery } from "../src/manual/service.js";
import { runManualCheck } from "../src/manual/service.js";
import { validateManualConsistency } from "../src/manual/validator.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";
import type { PrototypeDsl } from "../src/domain/types.js";

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

test("TC-080-001: 生成产品手册、操作手册和追踪矩阵", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v080-manual-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "user.md", title: "用户管理", content: "# 用户管理\n\n支持新增、查看、授权和批量导入用户。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-080", requirementName: "user-management", revision: 1,
  });
  const paths = await generateManualDelivery(output);
  const product = await readJson<any>(path.join(output, "10-product-manual", "product-manual.json"));
  const operation = await readJson<any>(path.join(output, "11-operation-manual", "operation-manual.json"));
  const trace = await readJson<any>(paths.traceabilityPath);
  assert.equal(product.schemaVersion, "0.8");
  assert.equal(product.modules.length, 6);
  assert.ok(product.modules.every((module: any) => module.sourceReferences.length > 0));
  assert.equal(operation.schemaVersion, "0.8");
  assert.ok(operation.roleGuides.some((guide: any) => guide.role === "平台管理员"));
  assert.equal(trace.summary.missingCount, 0);
  assert.match(await readFile(paths.productManualPath, "utf8"), /用户列表/);
  assert.match(await readFile(paths.operationManualPath, "utf8"), /批量导入/);
});

test("TC-080-003: 手册一致性检查覆盖页面、字段、按钮、角色、路径、规则和追踪", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v080-check-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "organization.md", title: "组织结构管理", content: "# 组织结构管理\n\n支持维护上下级组织关系。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-081", requirementName: "organization-management", revision: 1,
  });
  await generateManualDelivery(output);
  const checked = await runManualCheck(output);
  assert.equal(checked.report.valid, true);
  assert.deepEqual(Object.values(checked.report.checks), ["PASS", "PASS", "PASS", "PASS", "PASS", "PASS"]);
  assert.match(await readFile(checked.markdownPath, "utf8"), /检查结论：PASS/);
});

test("TC-080-004: 一致性检查拦截虚构字段、角色越权、无效跳转和追踪缺口", () => {
  const prototype: PrototypeDsl = {
    schemaVersion: "0.2", product: { name: "测试", description: "测试" }, navigation: [{ label: "列表", pageId: "P1", roles: ["管理员"] }],
    pages: [{ id: "P1", name: "列表", route: "/list", pattern: "list", fields: [{ id: "name", label: "名称", type: "text", required: true }], actions: [{ id: "create", label: "新增", kind: "primary", roles: ["管理员"] }] }],
    rules: [{ id: "required-name", description: "名称必填", appliesTo: ["P1:name"] }], transitions: [],
    designTokens: { colors: {}, spacing: {}, radius: {}, typography: { fontSize: {}, fontWeight: {}, lineHeight: {} } },
  };
  const generated = generateManuals(prototype, "# PRD");
  generated.productManual.modules[0].fields.push({ id: "fabricated", label: "虚构", required: false });
  generated.productManual.roles.push({ name: "访客", pageIds: ["P1"] });
  generated.operationManual.roleGuides.push({ role: "访客", operations: [{
    id: "bad", title: "越权操作", entryPageId: "P1", preconditions: [],
    steps: [{ order: 1, pageId: "P1", actionId: "create", instruction: "新增", targetPageId: "P2" }], expectedResult: "完成", sourceReferences: [],
  }] });
  generated.traceability.items.find((item) => item.sourceKind === "prototype-rule")!.productManualSectionIds = [];
  generated.traceability.summary.missingCount = 1;
  const report = validateManualConsistency(prototype, generated.productManual, generated.operationManual, generated.traceability);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "UNKNOWN_FIELD"));
  assert.ok(report.issues.some((issue) => issue.code === "ROLE_ACCESS_MISMATCH"));
  assert.ok(report.issues.some((issue) => issue.code === "INVALID_TRANSITION"));
  assert.ok(report.issues.some((issue) => issue.code === "TRACEABILITY_GAP"));
});

test("TC-080-002: 操作步骤只引用真实页面、操作和跳转", () => {
  const prototype: PrototypeDsl = {
    schemaVersion: "0.2", product: { name: "测试", description: "测试" }, navigation: [{ label: "列表", pageId: "P1", roles: ["管理员"] }],
    pages: [
      { id: "P1", name: "列表", route: "/list", pattern: "list", fields: [], actions: [{ id: "create", label: "新增", kind: "primary", roles: ["管理员"] }] },
      { id: "P2", name: "新增", route: "/create", pattern: "form", fields: [], actions: [] },
    ], rules: [], transitions: [{ sourcePageId: "P1", triggerType: "action", triggerId: "create", triggerLabel: "新增", targetPageId: "P2" }],
    designTokens: { colors: {}, spacing: {}, radius: {}, typography: { fontSize: {}, fontWeight: {}, lineHeight: {} } },
  };
  const result = generateManuals(prototype, "# PRD");
  const operation = result.operationManual.roleGuides[0].operations[0];
  assert.equal(operation.steps[0].pageId, "P1");
  assert.equal(operation.steps[0].actionId, "create");
  assert.equal(operation.steps[0].targetPageId, "P2");
  assert.equal(result.traceability.summary.missingCount, 0);
});

test("TC-080-005: 需求修订后识别新增、修改和删除的手册影响", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v080-impact-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "organization.md", title: "组织结构管理", content: "# 组织结构管理\n\n支持维护组织关系。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-082", requirementName: "organization-management", revision: 1,
  });
  await writeFile(path.join(output, "requirement.json"), `${JSON.stringify({ projectId: "base-platform", projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-082", requirementName: "organization-management", revision: 1 }, null, 2)}\n`, "utf8");
  await generateManualDelivery(output);
  const prototypePath = path.join(output, "06-prototype", "prototype.json");
  const requirementPath = path.join(output, "requirement.json");
  const prototype = await readJson<any>(prototypePath);
  prototype.pages[0].fields.push({ id: "organization-code", label: "组织编码", type: "text", required: true });
  prototype.rules.pop();
  await writeFile(prototypePath, `${JSON.stringify(prototype, null, 2)}\n`, "utf8");
  const requirement = await readJson<any>(requirementPath);
  requirement.revision = 2;
  await writeFile(requirementPath, `${JSON.stringify(requirement, null, 2)}\n`, "utf8");
  const updated = await updateManualDelivery(output);
  assert.equal(updated.report.changed, true);
  assert.equal(updated.report.previousRevision, 1);
  assert.equal(updated.report.currentRevision, 2);
  assert.ok(updated.report.impact.modified.includes("requirement"));
  assert.ok(updated.report.impact.modified.some((item) => item.startsWith("page:")));
  assert.ok(updated.report.impact.removed.some((item) => item.startsWith("rule:")));
});

test("TC-080-006: 增量更新按稳定 ID 保留手工补充并移除失效章节", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v080-preserve-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run({ sourcePath: "user.md", title: "用户管理", content: "# 用户管理\n\n支持用户维护。" }, output, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-083", requirementName: "user-management", revision: 1,
  });
  await generateManualDelivery(output);
  const productPath = path.join(output, "10-product-manual", "product-manual.json");
  const product = await readJson<any>(productPath);
  const preservedId = product.modules[0].id;
  product.modules[0].manualNotes = "这是产品经理人工补充的业务边界。";
  await writeFile(productPath, `${JSON.stringify(product, null, 2)}\n`, "utf8");
  const prototypePath = path.join(output, "06-prototype", "prototype.json");
  const prototype = await readJson<any>(prototypePath);
  const removedPageId = prototype.pages.at(-1).id;
  prototype.pages.pop();
  prototype.navigation = prototype.navigation.filter((item: any) => item.pageId !== removedPageId);
  prototype.transitions = prototype.transitions.filter((item: any) => item.sourcePageId !== removedPageId && item.targetPageId !== removedPageId);
  await writeFile(prototypePath, `${JSON.stringify(prototype, null, 2)}\n`, "utf8");
  const updated = await updateManualDelivery(output);
  const regenerated = await readJson<any>(productPath);
  assert.equal(regenerated.modules.find((item: any) => item.id === preservedId).manualNotes, "这是产品经理人工补充的业务边界。");
  assert.ok(updated.report.preservedManualNotes.includes(preservedId));
  assert.equal(regenerated.modules.some((item: any) => item.id === `module:${removedPageId}`), false);
  assert.match(await readFile(path.join(output, "10-product-manual", "product-manual.md"), "utf8"), /产品经理人工补充/);
});
