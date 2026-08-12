import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ProductBaseline } from "../src/product-baseline/types.js";
import { calculateProductBaselineHash } from "../src/product-baseline/service.js";
import { loadRelevantProductContext, selectProductContext } from "../src/product-context/service.js";
import { PromptBuilder } from "../src/prompting/prompt-builder.js";
import type { WorkflowContext } from "../src/domain/types.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const source = { requirementId: "REQ-001", requirementRevision: 1, artifact: "requirements/REQ-001-user-management/06-prototype/prototype.json" };

function baseline(): ProductBaseline {
  const value: ProductBaseline = {
    schemaVersion: "1.1",
    project: { id: "base-platform", name: "基础平台" },
    product: { name: "基础平台", description: "企业基础能力", version: "1.0.0" },
    baseline: { sequence: 1, status: "accepted", createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z", hash: "" },
    requirements: [{ id: "REQ-001", name: "user-management", revision: 1, productVersion: "1.0.0", acceptedAt: "2026-08-12T00:00:00.000Z" }],
    modules: [
      { id: "module:user-list", name: "用户管理", entryPageId: "user-list", roles: ["admin"], source },
      { id: "module:department-list", name: "部门管理", entryPageId: "department-list", roles: ["admin"], source },
    ],
    pages: [
      { id: "user-list", name: "用户列表", route: "/users", pattern: "list", roles: ["admin"], fields: [{ id: "username", name: "用户名", type: "text", required: true, source }], actions: [{ id: "create-user", name: "新增用户", kind: "primary", roles: ["admin"], source }], source },
      { id: "department-list", name: "部门列表", route: "/departments", pattern: "list", roles: ["admin"], fields: [{ id: "department-name", name: "部门名称", type: "text", required: true, source }], actions: [], source },
    ],
    rules: [{ id: "unique-username", description: "用户名必须唯一", appliesTo: ["user-list"], source }],
  };
  value.baseline.hash = calculateProductBaselineHash(value);
  return value;
}

const input = { sourcePath: "requirement.md", title: "用户批量导入", content: "# 用户批量导入\n\n在用户列表新增批量导入用户操作，用户名必须唯一。" };

test("TC-110-005: 只选择与新需求相关的产品事实并保留来源", () => {
  const selected = selectProductContext(baseline(), input);
  assert.ok(selected.selected.some((item) => item.id === "user-list"));
  assert.ok(selected.selected.some((item) => item.id === "unique-username"));
  assert.ok(!selected.selected.some((item) => item.id === "department-list"));
  assert.ok(selected.selected.every((item) => item.source.requirementId === "REQ-001"));
  assert.ok(selected.omittedCount > 0);
});

test("TC-110-006: 产品上下文加载严格限定在当前项目目录", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-product-context-"));
  const first = path.join(root, "base-platform", "product");
  const second = path.join(root, "hr-system", "product");
  await Promise.all([mkdir(first, { recursive: true }), mkdir(second, { recursive: true })]);
  const firstBaseline = baseline();
  const secondBaseline = baseline();
  secondBaseline.project = { id: "hr-system", name: "人力资源系统" };
  secondBaseline.baseline.hash = calculateProductBaselineHash(secondBaseline);
  await Promise.all([
    writeFile(path.join(first, "product-baseline.json"), JSON.stringify(firstBaseline), "utf8"),
    writeFile(path.join(second, "product-baseline.json"), JSON.stringify(secondBaseline), "utf8"),
  ]);
  const selected = await loadRelevantProductContext(path.join(root, "base-platform"), input);
  assert.equal(selected?.baseline.projectId, "base-platform");
});

test("TC-110-007: Prompt 将已确认产品事实作为受保护的独立上下文注入", () => {
  const productContext = selectProductContext(baseline(), input);
  const context: WorkflowContext = { runId: "run", startedAt: "now", input, artifacts: {}, productContext };
  const prompt = new PromptBuilder().buildStagePrompt("requirement-analysis", context);
  assert.match(prompt.user, /# 已确认产品上下文/);
  assert.match(prompt.user, /不得无依据地重命名、删除或覆盖/);
  assert.match(prompt.user, /来源 REQ-001 r1/);
  assert.doesNotMatch(prompt.user, /department-list/);
});

test("TC-110-008: 无基线时不生成产品上下文", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-no-product-context-"));
  assert.equal(await loadRelevantProductContext(root, input), undefined);
  await assert.rejects(() => readFile(path.join(root, "product", "product-baseline.json")), /ENOENT/);
});

test("TC-110-009: manifest 记录基线版本、查询指纹和所选事实来源", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-context-manifest-"));
  const projectDirectory = path.join(root, "base-platform");
  const productDirectory = path.join(projectDirectory, "product");
  const outputDirectory = path.join(projectDirectory, "requirements", "REQ-002-user-import");
  await mkdir(productDirectory, { recursive: true });
  await writeFile(path.join(productDirectory, "product-baseline.json"), JSON.stringify(baseline()), "utf8");
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, outputDirectory, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "1.1.0",
    requirementId: "REQ-002", requirementName: "user-import", revision: 1,
  });
  const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8")) as {
    productContext: { baseline: { sequence: number; hash: string }; query: { requirementId: string; fingerprint: string }; selected: Array<{ source: { requirementId: string } }> };
  };
  assert.equal(manifest.productContext.baseline.sequence, 1);
  assert.equal(manifest.productContext.baseline.hash.length, 64);
  assert.equal(manifest.productContext.query.requirementId, "REQ-002");
  assert.equal(manifest.productContext.query.fingerprint.length, 64);
  assert.ok(manifest.productContext.selected.every((item) => item.source.requirementId === "REQ-001"));
});
