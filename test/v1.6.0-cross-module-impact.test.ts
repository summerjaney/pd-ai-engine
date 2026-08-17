import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { analyzeCrossModuleImpact, renderCrossModuleImpact, renderCrossModuleMermaid } from "../src/cross-module-impact/service.js";
import { PlatformModuleService } from "../src/platform-modules/service.js";

async function catalog() {
  return new PlatformModuleService().load(path.resolve("knowledge/platform/modules"));
}

test("v1.6.0 identifies direct impacts for a cross-module data-permission requirement", async () => {
  const sourcePath = path.resolve("test/fixtures/v1.6.0/cross-module-data-permission.md");
  const content = await readFile(sourcePath, "utf8");
  const report = analyzeCrossModuleImpact({ sourcePath, title: "跨模块数据权限控制", content }, await catalog());
  const direct = report.impacts.filter((item) => item.level === "DIRECT").map((item) => item.moduleId);
  for (const expected of ["module.organization", "module.permission", "module.form", "module.workflow", "module.reporting"]) assert.ok(direct.includes(expected), expected);
  assert.equal(report.summary.total, 5);
});

test("v1.6.0 expands upstream module dependencies as indirect impacts", async () => {
  const report = analyzeCrossModuleImpact({ sourcePath: "workflow.md", title: "流程待办优化", content: "# 流程待办优化\n\n调整流程实例和待办任务展示。" }, await catalog());
  assert.equal(report.impacts.find((item) => item.moduleId === "module.workflow")?.level, "DIRECT");
  assert.equal(report.impacts.find((item) => item.moduleId === "module.form")?.level, "INDIRECT");
  assert.equal(report.impacts.find((item) => item.moduleId === "module.permission")?.level, "INDIRECT");
  assert.equal(report.impacts.find((item) => item.moduleId === "module.organization")?.level, "INDIRECT");
});

test("v1.6.0 marks downstream consumers for regression when a dependency changes", async () => {
  const report = analyzeCrossModuleImpact({ sourcePath: "organization.md", title: "组织机构调整", content: "# 组织机构调整\n\n调整组织层级关系和人员组织归属。" }, await catalog());
  assert.equal(report.impacts.find((item) => item.moduleId === "module.organization")?.level, "DIRECT");
  assert.equal(report.impacts.find((item) => item.moduleId === "module.permission")?.level, "REGRESSION");
});

test("v1.6.0 recommends a platform enhancement for shared cross-module rules", async () => {
  const sourcePath = path.resolve("test/fixtures/v1.6.0/cross-module-data-permission.md");
  const content = await readFile(sourcePath, "utf8");
  const report = analyzeCrossModuleImpact({ sourcePath, title: "跨模块数据权限控制", content }, await catalog());
  assert.equal(report.boundary.recommendation, "platform-enhancement");
  assert.equal(report.boundary.requiresHumanConfirmation, true);
  assert.equal(report.boundary.status, "pending-product-manager-confirmation");
});

test("v1.6.0 preserves architecture assessment priority", async () => {
  const report = analyzeCrossModuleImpact({ sourcePath: "migration.md", title: "权限模型迁移", content: "# 权限模型迁移\n\n调整底层模型并迁移历史数据，要求向后兼容。" }, await catalog());
  assert.equal(report.boundary.recommendation, "architecture-assessment");
  assert.equal(report.boundary.confidence, "high");
});

test("v1.6.0 does not misclassify explicit single-project work as a platform enhancement", async () => {
  const report = analyzeCrossModuleImpact({ sourcePath: "custom.md", title: "客户专用表单", content: "# 客户专用表单\n\n仅本项目使用的客户定制表单。" }, await catalog());
  assert.equal(report.boundary.recommendation, "project-customization");
  assert.equal(report.boundary.requiresHumanConfirmation, true);
});

test("v1.6.0 renders traceable markdown and dependency graph", async () => {
  const report = analyzeCrossModuleImpact({ sourcePath: "workflow.md", title: "流程待办优化", content: "# 流程待办优化\n\n调整流程实例和待办任务展示。" }, await catalog());
  assert.match(renderCrossModuleImpact(report), /直接\/间接\/回归/);
  assert.match(renderCrossModuleImpact(report), /必须人工确认：是/);
  assert.match(renderCrossModuleMermaid(report), /^flowchart TD/m);
  assert.match(renderCrossModuleMermaid(report), /workflow|流程设计/);
});
