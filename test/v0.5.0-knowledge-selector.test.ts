import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeLoader } from "../src/knowledge/loader.js";
import { KnowledgeSelectionError, KnowledgeSelector } from "../src/knowledge/selector.js";
import { createKnowledgeTrace } from "../src/knowledge/trace.js";

const load = () => new KnowledgeLoader().load();
const ids = (items: { knowledgeId: string }[]) => items.map((item) => item.knowledgeId);

test("TC-050-009: 列表管理需求选择列表页 Pattern 及其依赖", async () => {
  const result = new KnowledgeSelector().select(await load(), { text: "用户管理需要列表、查询和分页" });
  assert.ok(ids(result.selectedKnowledge).includes("pattern.list-page"));
  assert.ok(ids(result.selectedKnowledge).includes("component.data-table"));
  assert.ok(ids(result.selectedKnowledge).includes("rule.list-search"));
});

test("TC-050-010: 危险操作选择确认 Rule 与确认弹窗", async () => {
  const result = new KnowledgeSelector().select(await load(), { text: "用户停用和删除属于危险操作，需要确认" });
  assert.ok(ids(result.selectedKnowledge).includes("component.confirmation-dialog"));
  assert.ok(ids(result.selectedKnowledge).includes("rule.destructive-confirmation"));
});

test("TC-050-011: 流程型需求选择状态流转 Pattern", async () => {
  const result = new KnowledgeSelector().select(await load(), { text: "员工调动需要提交审批并展示状态流转" });
  assert.ok(ids(result.selectedKnowledge).includes("business.workflow-business"));
  assert.ok(ids(result.selectedKnowledge).includes("pattern.status-transition"));
});

test("TC-050-012: 无关知识不会被注入", async () => {
  const result = new KnowledgeSelector().select(await load(), { text: "只查看用户详情" });
  assert.ok(ids(result.selectedKnowledge).includes("pattern.detail-page"));
  assert.ok(!ids(result.selectedKnowledge).includes("pattern.batch-operation"));
  assert.ok(!ids(result.selectedKnowledge).includes("rule.destructive-confirmation"));
});

test("TC-050-013: 相同输入的选择结果及顺序稳定", async () => {
  const catalog = await load();
  const selector = new KnowledgeSelector();
  const input = { text: "用户列表支持查询、新增、编辑和停用" };
  assert.deepEqual(selector.select(catalog, input), selector.select(catalog, input));
});

test("TC-050-014: 显式知识覆盖同一条自动选择并补齐依赖", async () => {
  const result = new KnowledgeSelector().select(await load(), {
    text: "用户列表查询",
    explicitKnowledgeIds: ["pattern.list-page", "pattern.batch-operation"],
  });
  const list = result.selectedKnowledge.find((item) => item.knowledgeId === "pattern.list-page");
  const batch = result.selectedKnowledge.find((item) => item.knowledgeId === "pattern.batch-operation");
  assert.equal(list?.source, "explicit");
  assert.equal(batch?.source, "explicit");
  assert.ok(ids(result.selectedKnowledge).includes("component.confirmation-dialog"));
});

test("TC-050-015: 无效显式知识 ID 立即失败", async () => {
  assert.throws(
    () => new KnowledgeSelector().select(awaitValue, { text: "", explicitKnowledgeIds: ["pattern.missing"] }),
    KnowledgeSelectionError,
  );
});

test("选择结果可转换为独立知识追踪快照", async () => {
  const selection = new KnowledgeSelector().select(await load(), { text: "列表查询" });
  const trace = createKnowledgeTrace(selection);
  assert.equal(trace.knowledgeCatalogVersion, selection.catalogVersion);
  assert.deepEqual(trace.selectedKnowledge, selection.selectedKnowledge);
  assert.notEqual(trace.selectedKnowledge, selection.selectedKnowledge);
});

const awaitValue = await load();
