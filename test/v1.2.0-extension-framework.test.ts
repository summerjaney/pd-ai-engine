import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { composeExtensionContext, discoverExtensions, loadExtension, validateExtensionManifest } from "../src/extensions/service.js";
import { PromptBuilder } from "../src/prompting/prompt-builder.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import type { WorkflowContext } from "../src/domain/types.js";
import { loadExtensionWorkspace } from "../src/extensions/workspace.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("TC-120-001: 扩展清单执行结构、类型和安全路径校验", () => {
  const result = validateExtensionManifest({ schemaVersion: "1.2", id: "Bad ID", name: "", type: "unknown", version: "1", compatibleWith: {}, provides: { rules: ["../secret.json"] } });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.path === "id"));
  assert.ok(result.issues.some((issue) => issue.path === "provides.rules"));
});

test("TC-120-002: 加载低代码领域扩展并为每项资源保留来源", async () => {
  const extension = await loadExtension(path.join(repositoryRoot, "domains", "lowcode-platform"));
  assert.equal(extension.manifest.id, "lowcode-platform");
  assert.equal(extension.resources.length, 7);
  assert.ok(extension.resources.every((resource) => resource.source.extensionId === "lowcode-platform"));
  assert.ok(extension.resources.some((resource) => resource.id === "lowcode.platform-boundary"));
});

test("TC-120-003: 扩展发现忽略不含清单的普通目录", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-extensions-"));
  await mkdir(path.join(root, "ordinary"));
  const extensionRoot = path.join(root, "demo");
  await mkdir(extensionRoot);
  await writeFile(path.join(extensionRoot, "extension.json"), JSON.stringify({ schemaVersion: "1.2", id: "demo", name: "Demo", type: "domain", version: "1.0.0", compatibleWith: { pae: ">=1.2.0" }, provides: {} }), "utf8");
  const extensions = await discoverExtensions(root);
  assert.deepEqual(extensions.map((item) => item.manifest.id), ["demo"]);
});

test("TC-120-004: 产品扩展按依赖顺序覆盖领域同名规则并记录冲突", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-compose-"));
  const domainRoot = path.join(root, "domain"); const productRoot = path.join(root, "product");
  await Promise.all([mkdir(path.join(domainRoot, "rules"), { recursive: true }), mkdir(path.join(productRoot, "rules"), { recursive: true })]);
  await writeFile(path.join(domainRoot, "extension.json"), JSON.stringify({ schemaVersion: "1.2", id: "domain", name: "领域", type: "domain", version: "1.0.0", compatibleWith: { pae: ">=1.2.0" }, provides: { rules: ["rules/form.json"] } }), "utf8");
  await writeFile(path.join(productRoot, "extension.json"), JSON.stringify({ schemaVersion: "1.2", id: "product", name: "产品", type: "product", version: "1.0.0", compatibleWith: { pae: ">=1.2.0" }, extends: ["domain"], provides: { rules: ["rules/form.json"] } }), "utf8");
  await writeFile(path.join(domainRoot, "rules", "form.json"), JSON.stringify({ id: "form-rule", statement: "领域默认" }), "utf8");
  await writeFile(path.join(productRoot, "rules", "form.json"), JSON.stringify({ id: "form-rule", statement: "产品特例" }), "utf8");
  const context = composeExtensionContext([await loadExtension(productRoot), await loadExtension(domainRoot)]);
  assert.deepEqual(context.extensions.map((item) => item.id), ["domain", "product"]);
  assert.equal(context.conflicts.length, 1);
  assert.equal(context.conflicts[0]?.selected.extensionId, "product");
  assert.deepEqual(context.resources.find((item) => item.id === "form-rule")?.value, { id: "form-rule", statement: "产品特例" });
});

test("TC-120-005: 缺失依赖和循环依赖均禁止组合", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-dependency-"));
  const create = async (id: string, dependencies: string[]) => {
    const target = path.join(root, id); await mkdir(target);
    await writeFile(path.join(target, "extension.json"), JSON.stringify({ schemaVersion: "1.2", id, name: id, type: "domain", version: "1.0.0", compatibleWith: { pae: ">=1.2.0" }, extends: dependencies, provides: {} }), "utf8");
    return loadExtension(target);
  };
  const missing = await create("missing-owner", ["absent"]);
  assert.throws(() => composeExtensionContext([missing]), /缺少依赖扩展/);
  const first = await create("first", ["second"]); const second = await create("second", ["first"]);
  assert.throws(() => composeExtensionContext([first, second]), /循环/);
});

test("TC-120-006: Prompt 独立注入扩展资源、来源和覆盖记录", async () => {
  const lowcode = await loadExtension(path.join(repositoryRoot, "domains", "lowcode-platform"));
  const extensionContext = composeExtensionContext([lowcode]);
  const context: WorkflowContext = {
    runId: "run", startedAt: "now", artifacts: {}, extensionContext,
    input: { sourcePath: "requirement.md", title: "表单字段联动", content: "# 表单字段联动\n\n根据字段值配置联动。" },
  };
  const prompt = new PromptBuilder().buildStagePrompt("requirement-analysis", context);
  assert.match(prompt.user, /# 已加载定制化扩展/);
  assert.match(prompt.user, /lowcode-platform@1.0.0/);
  assert.match(prompt.user, /平台通用能力与项目定制边界/);
  assert.match(prompt.user, /来源：lowcode-platform@1.0.0\/rules\/platform-boundary.json/);
});

test("TC-120-007: 工作流加载扩展并在 manifest 保留可重现快照", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-extension-workflow-"));
  const outputDirectory = path.join(root, "base-platform", "requirements", "REQ-001-form-linkage");
  await new ProductDesignWorkflow(new MockStageExecutor()).run(
    { sourcePath: "requirement.md", title: "表单字段联动", content: "# 表单字段联动\n\n在低代码表单设计器中配置字段联动。" },
    outputDirectory,
    { projectId: "base-platform", projectName: "基础平台", productVersion: "3.1.0", requirementId: "REQ-001", requirementName: "form-linkage", revision: 1 },
    { extensionDirectories: [path.join(repositoryRoot, "domains", "lowcode-platform")] },
  );
  const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8")) as {
    extensionContext: { extensions: Array<{ id: string }>; resources: Array<{ source: { path: string } }> };
  };
  assert.deepEqual(manifest.extensionContext.extensions.map((item) => item.id), ["lowcode-platform"]);
  assert.equal(manifest.extensionContext.resources.length, 7);
  assert.ok(manifest.extensionContext.resources.some((item) => item.source.path === "rules/platform-boundary.json"));
});

test("TC-120-008: 未配置扩展时保持 v1.1.0 通用工作流行为", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-no-extension-"));
  const context = await new ProductDesignWorkflow(new MockStageExecutor()).run(
    { sourcePath: "requirement.md", title: "通用需求", content: "# 通用需求\n\n建立一个通用信息列表。" }, root,
  );
  assert.equal(context.extensionContext, undefined);
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as { extensionContext?: unknown };
  assert.equal(manifest.extensionContext, undefined);
});

test("TC-120-009: 产品工作空间按相对路径组合领域与产品扩展", async () => {
  const workspace = await loadExtensionWorkspace(path.join(repositoryRoot, "examples", "base-platform-workspace", "pae.workspace.json"));
  assert.deepEqual(workspace.context.extensions.map((item) => item.id), ["lowcode-platform", "base-platform-demo"]);
  assert.equal(workspace.context.conflicts.length, 1);
  const rule = workspace.context.resources.find((item) => item.id === "lowcode.model-form-relationship");
  assert.equal(rule?.source.extensionId, "base-platform-demo");
  assert.match(JSON.stringify(rule?.value), /必须先在数据表中新增字段/);
});

test("TC-120-010: 无扩展或缺少产品信息的工作空间被拒绝", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-invalid-workspace-"));
  const workspacePath = path.join(root, "pae.workspace.json");
  await writeFile(workspacePath, JSON.stringify({ schemaVersion: "1.2", id: "invalid", name: "无效", product: {}, extensionDirectories: [] }), "utf8");
  await assert.rejects(() => loadExtensionWorkspace(workspacePath), /缺少名称|至少一个扩展目录/);
});
