import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PlatformKnowledgeService } from "../src/platform-knowledge/service.js";
import { PlatformKnowledgeValidationError } from "../src/platform-knowledge/validator.js";
import { assessCapabilityGap, renderCapabilityGapAssessment } from "../src/platform-knowledge/assessment.js";
import { loadExtensionWorkspace } from "../src/extensions/workspace.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { analyzePlatformRequirement } from "../src/platform-analysis/service.js";
import { PromptBuilder } from "../src/prompting/prompt-builder.js";
import { validatePlatformKnowledgeConsistency } from "../src/platform-knowledge/consistency.js";
import { runDesignReview } from "../src/design-review/service.js";

test("v1.4.0 loads the confirmed base-platform knowledge sample", async () => {
  const catalog = await new PlatformKnowledgeService().load(path.resolve("knowledge/platform"));
  assert.equal(catalog.schemaVersion, "1.4");
  assert.equal(catalog.product.id, "base-platform");
  assert.equal(catalog.entities.length, 4);
  assert.equal(catalog.byId.get("capability.organization.structure")?.status, "confirmed");
});

test("v1.4.0 searches only confirmed knowledge by default", async () => {
  const service = new PlatformKnowledgeService();
  const catalog = await service.load(path.resolve("knowledge/platform"));
  const result = service.search(catalog, "组织结构");
  assert.deepEqual(result.map((item) => item.id), ["capability.organization.structure"]);
});

test("v1.4.0 rejects a missing knowledge reference", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v140-"));
  await mkdir(path.join(directory, "capabilities"));
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({
    schemaVersion: "1.4", version: "1.4.0", product: { id: "base-platform", name: "基础平台", version: "3.0.0" }, entries: ["capabilities/a.json"],
  }));
  await writeFile(path.join(directory, "capabilities/a.json"), JSON.stringify({
    id: "capability.a", kind: "capability", name: "A", description: "A capability", version: "1.0.0", status: "confirmed", tags: [],
    source: { type: "product-manager", document: "manual" }, domain: "system", module: "a", level: "platform", supportedScenarios: [], constraints: [],
    references: [{ id: "pattern.missing", kind: "pattern" }],
  }));
  await assert.rejects(() => new PlatformKnowledgeService().load(directory), PlatformKnowledgeValidationError);
});

test("v1.4.0 rejects path traversal in the platform catalog", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v140-path-"));
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({
    schemaVersion: "1.4", version: "1.4.0", product: { id: "base-platform", name: "基础平台", version: "3.0.0" }, entries: ["../outside.json"],
  }));
  await assert.rejects(() => new PlatformKnowledgeService().load(directory), /路径越界/);
});

test("v1.4.0 matches organization capability and expands all reusable references", async () => {
  const catalog = await new PlatformKnowledgeService().load(path.resolve("knowledge/platform"));
  const report = assessCapabilityGap({
    sourcePath: "organization.md",
    title: "组织结构有效期管理",
    content: "# 组织结构有效期管理\n\n现有组织结构增加生效时间、失效时间和历史版本查询。",
  }, catalog);
  assert.deepEqual(report.reuse.capabilities, ["capability.organization.structure"]);
  assert.deepEqual(report.reuse.patterns, ["pattern.tree-table-management"]);
  assert.deepEqual(report.reuse.components, ["component.organization-tree"]);
  assert.deepEqual(report.reuse.constraints, ["constraint.organization.code-unique"]);
  assert.ok(report.gaps.some((item) => item.id === "gap.effective-date"));
  assert.ok(report.gaps.some((item) => item.id === "gap.history-version"));
  assert.equal(report.boundary.recommendation, "platform-enhancement");
  assert.equal(report.boundary.requiresHumanConfirmation, true);
});

test("v1.4.0 does not treat project-only customization as a platform capability", async () => {
  const catalog = await new PlatformKnowledgeService().load(path.resolve("knowledge/platform"));
  const report = assessCapabilityGap({ sourcePath: "custom.md", title: "客户专用看板", content: "# 客户专用看板\n\n仅本项目使用的客户定制大屏。" }, catalog);
  assert.equal(report.reuse.capabilities.length, 0);
  assert.equal(report.boundary.recommendation, "project-customization");
  assert.equal(report.boundary.confidence, "low");
});

test("v1.4.0 capability gap markdown exposes evidence, reuse and human gate", async () => {
  const catalog = await new PlatformKnowledgeService().load(path.resolve("knowledge/platform"));
  const report = assessCapabilityGap({ sourcePath: "organization.md", title: "组织结构", content: "# 组织结构\n\n增加组织有效期。" }, catalog);
  const markdown = renderCapabilityGapAssessment(report);
  assert.match(markdown, /可复用资产/);
  assert.match(markdown, /基础平台3\.0概要设计/);
  assert.match(markdown, /必须人工确认：是/);
});

test("v1.4.0 workflow writes a standalone capability gap report", async () => {
  const workspace = await loadExtensionWorkspace(path.resolve("examples/base-platform-workspace/pae.workspace.json"));
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v140-workflow-"));
  const context = await new ProductDesignWorkflow(new MockStageExecutor()).run(
    { sourcePath: "organization.md", title: "组织结构有效期", content: "# 组织结构有效期\n\n组织结构增加生效时间、失效时间和历史版本查询。" },
    output,
    undefined,
    { extensionDirectories: workspace.extensionDirectories },
  );
  assert.equal(context.platformAnalysis?.capabilityGap?.boundary.recommendation, "platform-enhancement");
  assert.match(await (await import("node:fs/promises")).readFile(path.join(output, "00-platform-analysis", "capability-gap.md"), "utf8"), /平台能力差距分析/);
  assert.ok(JSON.parse(await (await import("node:fs/promises")).readFile(path.join(output, "00-platform-analysis", "capability-gap.json"), "utf8")).reuse.capabilities.length > 0);
  assert.equal(context.platformKnowledgeConsistency?.valid, true);
  assert.ok(context.platformKnowledgeConsistency?.summary.checkedReferenceCount);
  for (const artifact of ["01-requirement-analysis.md", "02-product-outline.md", "03-product-architecture.md", "04-core-flow.md", "05-page-structure.md", "09-prd.md", "10-review.md"]) {
    assert.match(await (await import("node:fs/promises")).readFile(path.join(output, artifact), "utf8"), /\[platform-knowledge:/, artifact);
  }
  const prototype = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(output, "06-prototype", "prototype.json"), "utf8"));
  assert.match(prototype.product.sourceAttribution, /platform-knowledge:capability\.organization\.structure/);
  assert.ok(prototype.rules.some((rule: { id: string }) => rule.id === "constraint.organization.code-unique"));
  const prompt = new PromptBuilder().buildStagePrompt("prd", context);
  assert.match(prompt.user, /复用平台能力：capability\.organization\.structure/);
  assert.match(prompt.user, /复用页面模式：pattern\.tree-table-management/);
  const designReview = await runDesignReview(output);
  assert.equal(designReview.report.checks.find((item) => item.id === "platform-knowledge-consistency")?.status, "PASS");
});

test("v1.4.0 platform knowledge never overrides an architecture assessment", async () => {
  const workspace = await loadExtensionWorkspace(path.resolve("examples/base-platform-workspace/pae.workspace.json"));
  const catalog = await new PlatformKnowledgeService().load(path.resolve("knowledge/platform"));
  const report = analyzePlatformRequirement(
    { sourcePath: "organization.md", title: "组织结构模型迁移", content: "# 组织结构模型迁移\n\n调整组织结构底层模型并迁移历史数据。" },
    workspace.context,
    catalog,
  );
  assert.equal(report.boundaryAssessment.recommendation, "architecture-assessment");
  assert.equal(report.boundaryAssessment.requiresHumanConfirmation, true);
});

test("v1.4.0 consistency check fails when an artifact loses its platform reference", async () => {
  const workspace = await loadExtensionWorkspace(path.resolve("examples/base-platform-workspace/pae.workspace.json"));
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v140-tamper-"));
  const context = await new ProductDesignWorkflow(new MockStageExecutor()).run(
    { sourcePath: "organization.md", title: "组织结构管理", content: "# 组织结构管理\n\n维护组织层级、编码与停用状态。" }, output, undefined,
    { extensionDirectories: workspace.extensionDirectories },
  );
  await writeFile(path.join(output, "09-prd.md"), "# PRD\n\n平台知识引用被删除。\n", "utf8");
  const report = await validatePlatformKnowledgeConsistency(output, context.platformKnowledgeUsagePlan);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "PLATFORM_KNOWLEDGE_REFERENCE_MISSING" && issue.stage === "prd"));
});
