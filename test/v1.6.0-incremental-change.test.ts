import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeCrossModuleImpact } from "../src/cross-module-impact/service.js";
import { generateDesignUnitPlan } from "../src/design-units/service.js";
import { captureRequirementDesignSnapshot, detectRequirementChange, renderRequirementChangeReport, writeRequirementChangeReport } from "../src/incremental-change/service.js";
import { PlatformModuleService } from "../src/platform-modules/service.js";
import { selectSolution, writeSolutionComparison } from "../src/solution-options/service.js";

async function baseline() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-change-"));
  const sourcePath = path.resolve("test/fixtures/v1.6.0/cross-module-data-permission.md");
  const content = await readFile(sourcePath, "utf8");
  const input = { sourcePath, title: "跨模块数据权限控制", content };
  const catalog = await new PlatformModuleService().load(path.resolve("knowledge/platform/modules"));
  const impact = analyzeCrossModuleImpact(input, catalog);
  await writeSolutionComparison(directory, impact);
  await selectSolution(directory, "platform-enhancement", "组织、权限、表单、流程和报表");
  const { plan } = await generateDesignUnitPlan(directory, impact);
  await captureRequirementDesignSnapshot(directory, input, impact, plan);
  return { directory, input, impact, plan };
}

test("v1.6.0 requires an explicit design snapshot before change detection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-change-missing-"));
  const { input, impact } = await baseline();
  await assert.rejects(() => detectRequirementChange(directory, input, impact), /尚未建立需求设计快照/);
});

test("v1.6.0 reports no change and preserves every design unit", async () => {
  const { directory, input, impact, plan } = await baseline();
  const report = await detectRequirementChange(directory, input, impact);
  assert.equal(report.status, "NO_CHANGE");
  assert.equal(report.summary.affectedUnits, 0);
  assert.equal(report.summary.preservedUnits, plan.units.length);
  assert.deepEqual(report.invalidatedConfirmations, []);
  assert.equal(report.incrementalPlan.status, "unchanged");
});

test("v1.6.0 recomputes only units belonging to a modified module", async () => {
  const { directory, input, impact, plan } = await baseline();
  const current = structuredClone(impact);
  current.requirement.fingerprint = "changed-requirement";
  const permission = current.impacts.find((item) => item.moduleId === "module.permission")!;
  permission.reasons = [...permission.reasons, "新增指定组织数据范围"];
  const report = await detectRequirementChange(directory, { ...input, content: `${input.content}\n新增指定组织数据范围。` }, current);
  assert.equal(report.status, "CHANGE_DETECTED");
  assert.deepEqual(report.affectedModuleIds, ["module.permission"]);
  assert.ok(report.recomputedUnitIds.every((id) => id.startsWith("DU-PERMISSION-")));
  assert.ok(report.preservedUnitIds.includes("DU-FORM-DATA-MODEL"));
  assert.ok(report.summary.preservedUnits < plan.units.length);
});

test("v1.6.0 removes obsolete units when a module leaves the impact scope", async () => {
  const { directory, input, impact } = await baseline();
  const current = structuredClone(impact);
  current.requirement.fingerprint = "changed-without-reporting";
  current.impacts = current.impacts.filter((item) => item.moduleId !== "module.reporting");
  current.summary.direct -= 1;
  current.summary.total -= 1;
  current.dependencyEdges = current.dependencyEdges.filter((item) => item.from !== "module.reporting" && item.to !== "module.reporting");
  const report = await detectRequirementChange(directory, { ...input, content: `${input.content}\n本次取消报表范围。` }, current);
  assert.ok(report.moduleChanges.some((item) => item.moduleId === "module.reporting" && item.operation === "REMOVED"));
  assert.ok(report.removedUnitIds.length > 0);
  assert.ok(report.removedUnitIds.every((id) => id.startsWith("DU-REPORTING-")));
});

test("v1.6.0 invalidates only decision and downstream confirmations after change", async () => {
  const { directory, input, impact } = await baseline();
  const current = structuredClone(impact);
  current.requirement.fingerprint = "changed-confirmations";
  const report = await detectRequirementChange(directory, { ...input, content: `${input.content}\n修改权限范围。` }, current);
  assert.deepEqual(report.invalidatedConfirmations, ["solution-decision", "design-unit-plan", "design-unit-traceability", "solution-design-confirmation", "prototype-confirmation", "prd-confirmation"]);
  assert.equal(report.incrementalPlan.status, "pending-solution-reconfirmation");
});

test("v1.6.0 writes an auditable report and incremental plan", async () => {
  const { directory, input, impact } = await baseline();
  const current = structuredClone(impact);
  current.requirement.fingerprint = "changed-written-report";
  current.impacts[0].reasons.push("新的组织范围规则");
  const output = await writeRequirementChangeReport(directory, { ...input, content: `${input.content}\n新的组织范围规则。` }, current);
  assert.equal(output.report.status, "CHANGE_DETECTED");
  assert.match(await readFile(output.markdownPath, "utf8"), /复杂需求增量变更分析/);
  assert.equal(JSON.parse(await readFile(output.incrementalPlanPath, "utf8")).status, "pending-solution-reconfirmation");
});

test("v1.6.0 increments the snapshot sequence without losing explicit baselines", async () => {
  const { directory, input, impact, plan } = await baseline();
  const second = await captureRequirementDesignSnapshot(directory, input, impact, plan);
  assert.equal(second.snapshot.sequence, 2);
});

test("v1.6.0 renders preserved, recomputed and removed units for product review", async () => {
  const { directory, input, impact } = await baseline();
  const current = structuredClone(impact);
  current.requirement.fingerprint = "changed-render";
  current.impacts[0].reasons.push("变更");
  const report = await detectRequirementChange(directory, { ...input, content: `${input.content}\n变更。` }, current);
  const markdown = renderRequirementChangeReport(report);
  assert.match(markdown, /保留设计单元/);
  assert.match(markdown, /重算/);
  assert.match(markdown, /重新确认实施方案/);
});
