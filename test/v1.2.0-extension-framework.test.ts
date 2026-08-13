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
import { analyzePlatformRequirement, renderPlatformAnalysisReport } from "../src/platform-analysis/service.js";
import { confirmPlatformDecision, loadValidPlatformDecision } from "../src/platform-analysis/confirmation.js";

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

test("TC-120-011: 前置分析从产品能力地图识别模块、能力和来源", async () => {
  const workspace = await loadExtensionWorkspace(path.join(repositoryRoot, "examples", "base-platform-workspace", "pae.workspace.json"));
  const report = analyzePlatformRequirement(
    { sourcePath: "requirement.md", title: "表单字段联动", content: "# 表单字段联动\n\n在表单中选择数据表字段并配置字段联动。" },
    workspace.context,
  );
  assert.ok(report.currentState.affectedModules.includes("表单"));
  assert.ok(report.currentState.matchedCapabilities.some((item) => item.id === "form-field-selection"));
  assert.ok(report.currentState.matchedCapabilities.every((item) => item.source.extensionId === "base-platform-demo"));
  assert.equal(report.boundaryAssessment.recommendation, "platform-enhancement");
  assert.equal(report.boundaryAssessment.status, "pending-human-confirmation");
  assert.match(renderPlatformAnalysisReport(report), /不能替代产品经理/);
});

test("TC-120-012: 涉及模型迁移和兼容时优先进入架构评估且仍需人工确认", async () => {
  const workspace = await loadExtensionWorkspace(path.join(repositoryRoot, "examples", "base-platform-workspace", "pae.workspace.json"));
  const report = analyzePlatformRequirement(
    { sourcePath: "requirement.md", title: "模型版本迁移", content: "# 模型版本迁移\n\n调整底层模型，并兼容历史数据和已发布版本的回滚。" },
    workspace.context,
  );
  assert.equal(report.boundaryAssessment.recommendation, "architecture-assessment");
  assert.equal(report.boundaryAssessment.requiresHumanConfirmation, true);
  assert.ok(report.currentState.applicableRules.some((item) => item.id === "lowcode.lifecycle-compatibility"));
});

test("TC-120-013: 低代码工作流落盘前置分析并注入后续 Prompt", async () => {
  const workspace = await loadExtensionWorkspace(path.join(repositoryRoot, "examples", "base-platform-workspace", "pae.workspace.json"));
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-platform-analysis-"));
  const context = await new ProductDesignWorkflow(new MockStageExecutor()).run(
    { sourcePath: "requirement.md", title: "表单字段联动", content: "# 表单字段联动\n\n表单选择数据表字段后配置联动。" }, root, undefined,
    { extensionDirectories: workspace.extensionDirectories },
  );
  assert.ok(context.platformAnalysis?.currentState.matchedCapabilities.length);
  assert.match(await readFile(path.join(root, "00-platform-analysis", "platform-analysis.md"), "utf8"), /平台化判断建议/);
  const prompt = new PromptBuilder().buildStagePrompt("product-outline", context);
  assert.match(prompt.user, /# 低代码平台前置分析结果/);
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as { platformAnalysis: { boundaryAssessment: { status: string } } };
  assert.equal(manifest.platformAnalysis.boundaryAssessment.status, "pending-human-confirmation");
});

test("TC-120-014: 扩展上下文变化会改变运行指纹并阻止复用旧成果", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-extension-fingerprint-"));
  const input = { sourcePath: "requirement.md", title: "通用需求", content: "# 通用需求\n\n建立信息列表。" };
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await workflow.run(input, root);
  const withoutExtension = JSON.parse(await readFile(path.join(root, "run.json"), "utf8")) as { inputHash: string };
  await workflow.run(input, root, undefined, { extensionDirectories: [path.join(repositoryRoot, "domains", "lowcode-platform")], resume: true });
  const withExtension = JSON.parse(await readFile(path.join(root, "run.json"), "utf8")) as { inputHash: string; resumedFromRunId?: string };
  assert.notEqual(withExtension.inputHash, withoutExtension.inputHash);
  assert.equal(withExtension.resumedFromRunId, undefined);
});

test("TC-120-015: 启用门禁时首次运行只生成前置分析并阻止正式阶段", async () => {
  const workspace = await loadExtensionWorkspace(path.join(repositoryRoot, "examples", "base-platform-workspace", "pae.workspace.json"));
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-platform-gate-"));
  await assert.rejects(() => new ProductDesignWorkflow(new MockStageExecutor()).run(
    { sourcePath: "requirement.md", title: "字段联动", content: "# 字段联动\n\n表单字段需要联动。" }, root, undefined,
    { extensionDirectories: workspace.extensionDirectories, requirePlatformConfirmation: true },
  ), /WAITING_PLATFORM_CONFIRMATION/);
  assert.match(await readFile(path.join(root, "00-platform-analysis", "platform-analysis.md"), "utf8"), /待产品经理确认/);
  await assert.rejects(() => readFile(path.join(root, "01-requirement-analysis.md"), "utf8"), /ENOENT/);
});

test("TC-120-016: 人工确认与分析哈希绑定并允许继续完整设计", async () => {
  const workspace = await loadExtensionWorkspace(path.join(repositoryRoot, "examples", "base-platform-workspace", "pae.workspace.json"));
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-platform-confirm-"));
  const input = { sourcePath: "requirement.md", title: "字段联动", content: "# 字段联动\n\n表单选择数据表字段后需要联动。" };
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await assert.rejects(() => workflow.run(input, root, undefined, { extensionDirectories: workspace.extensionDirectories, requirePlatformConfirmation: true }), /WAITING/);
  const saved = await confirmPlatformDecision(root, { path: "platform-enhancement", scope: "表单设计器字段联动", note: "本版本不调整底层字段模型" });
  assert.equal(saved.confirmation.confirmedBy, "product-manager");
  const context = await workflow.run(input, root, undefined, { extensionDirectories: workspace.extensionDirectories, requirePlatformConfirmation: true, resume: true });
  assert.equal(context.platformDecision?.decision.path, "platform-enhancement");
  assert.match(await readFile(path.join(root, "01-requirement-analysis.md"), "utf8"), /需求分析/);
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as { platformDecision: { decision: { scope: string } } };
  assert.equal(manifest.platformDecision.decision.scope, "表单设计器字段联动");
});

test("TC-120-017: 需求或分析变化后旧人工确认自动失效", async () => {
  const workspace = await loadExtensionWorkspace(path.join(repositoryRoot, "examples", "base-platform-workspace", "pae.workspace.json"));
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-stale-confirm-"));
  const first = analyzePlatformRequirement({ sourcePath: "a.md", title: "字段联动", content: "# 字段联动\n\n新增联动。" }, workspace.context);
  await (await import("node:fs/promises")).mkdir(path.join(root, "00-platform-analysis"), { recursive: true });
  await writeFile(path.join(root, "00-platform-analysis", "platform-analysis.json"), JSON.stringify(first), "utf8");
  await confirmPlatformDecision(root, { path: "platform-enhancement", scope: "字段联动" });
  const changed = analyzePlatformRequirement({ sourcePath: "a.md", title: "字段联动", content: "# 字段联动\n\n新增联动并迁移历史模型。" }, workspace.context);
  assert.equal(await loadValidPlatformDecision(root, changed), undefined);
});
