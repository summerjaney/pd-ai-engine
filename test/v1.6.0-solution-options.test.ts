import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeCrossModuleImpact } from "../src/cross-module-impact/service.js";
import { PlatformModuleService } from "../src/platform-modules/service.js";
import { buildSolutionComparison, evaluateSolutionGate, renderSolutionComparison, selectSolution, writeSolutionComparison } from "../src/solution-options/service.js";

async function dataPermissionReport() {
  const sourcePath = path.resolve("test/fixtures/v1.6.0/cross-module-data-permission.md");
  const content = await readFile(sourcePath, "utf8");
  const catalog = await new PlatformModuleService().load(path.resolve("knowledge/platform/modules"));
  return analyzeCrossModuleImpact({ sourcePath, title: "跨模块数据权限控制", content }, catalog);
}

test("v1.6.0 builds four comparable implementation options", async () => {
  const comparison = buildSolutionComparison(await dataPermissionReport());
  assert.equal(comparison.options.length, 4);
  assert.deepEqual(comparison.options.map((item) => item.id), ["configuration", "platform-enhancement", "product-extension", "project-customization"]);
  assert.equal(comparison.recommendedOptionId, "platform-enhancement");
  assert.equal(comparison.gate.canProceed, false);
});

test("v1.6.0 comparison includes explicit tradeoffs and affected module scope", async () => {
  const comparison = buildSolutionComparison(await dataPermissionReport());
  const platform = comparison.options.find((item) => item.id === "platform-enhancement")!;
  assert.equal(platform.tradeoffs.reuseValue, 5);
  assert.ok(platform.scope.some((item) => item.includes("权限管理")));
  assert.ok(platform.risks.some((item) => item.includes("影响范围")));
});

test("v1.6.0 blocks formal design before product-manager selection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-solution-waiting-"));
  await writeSolutionComparison(directory, await dataPermissionReport());
  const gate = await evaluateSolutionGate(directory);
  assert.equal(gate.status, "WAITING_SELECTION");
  assert.equal(gate.canProceed, false);
});

test("v1.6.0 records an explicit product-manager solution decision", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-solution-selected-"));
  await writeSolutionComparison(directory, await dataPermissionReport());
  const selected = await selectSolution(directory, "platform-enhancement", "组织、权限、表单、流程和报表", "本版本不包含移动端页面改造");
  assert.equal(selected.decision.selectedBy, "product-manager");
  assert.equal(selected.decision.scope, "组织、权限、表单、流程和报表");
  const gate = await evaluateSolutionGate(directory);
  assert.equal(gate.status, "SELECTED");
  assert.equal(gate.canProceed, true);
});

test("v1.6.0 rejects a solution option not present in the comparison", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-solution-invalid-"));
  const report = await dataPermissionReport();
  report.boundary.recommendation = "architecture-assessment";
  await writeSolutionComparison(directory, report);
  await assert.rejects(() => selectSolution(directory, "project-customization", "项目范围"), /不存在选项/);
});

test("v1.6.0 invalidates a decision after comparison or requirement change", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-solution-stale-"));
  const written = await writeSolutionComparison(directory, await dataPermissionReport());
  await selectSolution(directory, "platform-enhancement", "平台统一数据权限");
  const comparison = JSON.parse(await readFile(written.jsonPath, "utf8"));
  comparison.requirementFingerprint = "changed-requirement";
  await writeFile(written.jsonPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
  const gate = await evaluateSolutionGate(directory);
  assert.equal(gate.status, "INVALIDATED");
  assert.equal(gate.canProceed, false);
});

test("v1.6.0 architecture risk produces assessment-first options", async () => {
  const report = await dataPermissionReport();
  report.boundary.recommendation = "architecture-assessment";
  const comparison = buildSolutionComparison(report);
  assert.equal(comparison.recommendedOptionId, "architecture-assessment");
  assert.deepEqual(comparison.options.map((item) => item.id), ["architecture-assessment", "platform-enhancement", "product-extension"]);
});

test("v1.6.0 renders a product-manager-readable comparison matrix", async () => {
  const markdown = renderSolutionComparison(buildSolutionComparison(await dataPermissionReport()));
  assert.match(markdown, /通用性/);
  assert.match(markdown, /复用价值/);
  assert.match(markdown, /实现成本/);
  assert.match(markdown, /当前门禁：禁止继续正式设计/);
});
