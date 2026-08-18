import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzePortfolioRelationships, assessRequirementPortfolio, buildRequirementPortfolio } from "../src/release-portfolio/service.js";
import { generateReleaseOptions, selectReleaseScope } from "../src/release-planning/service.js";
import { detectReleaseChanges, establishReleaseBaseline } from "../src/release-planning/baseline.js";
import { finalizeReleasePlanning } from "../src/release-planning/delivery.js";

async function json(file: string, value: unknown): Promise<void> { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value), "utf8"); }

test("v1.7.0 汇总多个需求并计算版本准入状态", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-portfolio-"));
  await json(path.join(root, "project.json"), { projectId: "base-platform", projectName: "基础平台" });
  const ready = path.join(root, "requirements", "REQ-101-organization-history");
  await json(path.join(ready, "requirement.json"), { requirementId: "REQ-101", requirementName: "organization-history", productVersion: "2.1.0", revision: 2 });
  await json(path.join(ready, "02-product-outline/solution-options/solution-decision.json"), { status: "selected", selectedOptionId: "platform-enhancement" });
  await json(path.join(ready, "02-product-outline/design-units/design-unit-plan.json"), { units: [{ moduleId: "module.organization" }, { moduleId: "module.permission" }] });
  await json(path.join(ready, "12-acceptance/complex-requirement/acceptance-report.json"), { status: "PASS" });
  const pending = path.join(root, "requirements", "REQ-102-reporting");
  await json(path.join(pending, "requirement.json"), { requirementId: "REQ-102", requirementName: "reporting", productVersion: "2.1.0", revision: 1 });
  const result = await buildRequirementPortfolio(root);
  assert.equal(result.portfolio.summary.total, 2);
  assert.equal(result.portfolio.summary.READY, 1);
  assert.equal(result.portfolio.summary.CONDITIONAL, 1);
  assert.deepEqual(result.portfolio.requirements[0].moduleIds, ["module.organization", "module.permission"]);
  assert.match(await readFile(result.markdownPath, "utf8"), /REQ-101.*READY/);
});

test("v1.7.0 将发生增量变化的需求标记为 STALE", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-portfolio-stale-"));
  await json(path.join(root, "project.json"), { projectId: "base-platform" });
  const req = path.join(root, "requirements", "REQ-201-permission");
  await json(path.join(req, "requirement.json"), { requirementId: "REQ-201", requirementName: "permission", productVersion: "2.2.0", revision: 1 });
  await json(path.join(req, "11-change-impact/requirement-change/requirement-change-report.json"), { status: "CHANGE_DETECTED" });
  const result = await buildRequirementPortfolio(root);
  assert.equal(result.portfolio.requirements[0].admissionStatus, "STALE");
});

test("v1.7.0 建议评分与产品经理业务复核严格分离", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-assessment-"));
  await json(path.join(root, "project.json"), { projectId: "base-platform" });
  const req = path.join(root, "requirements", "REQ-301-form-permission");
  await json(path.join(req, "requirement.json"), { requirementId: "REQ-301", requirementName: "form-permission", productVersion: "2.3.0", revision: 1 });
  await json(path.join(req, "02-product-outline/solution-options/solution-decision.json"), { status: "selected", selectedOptionId: "platform-enhancement" });
  await json(path.join(req, "02-product-outline/design-units/design-unit-plan.json"), { units: [{ moduleId: "module.form" }, { moduleId: "module.permission" }] });
  await json(path.join(req, "12-acceptance/complex-requirement/acceptance-report.json"), { status: "PASS" });
  const pending = await assessRequirementPortfolio(root);
  assert.equal(pending.assessment.requirements[0].reviewStatus, "AWAITING_PM_REVIEW");
  assert.equal(pending.assessment.requirements[0].finalPriorityScore, undefined);
  await json(pending.reviewPath, { schemaVersion: "1.7", reviews: { "REQ-301": { businessUrgency: 5, customerCoverage: 4, strategicAlignment: 5, note: "进入当前平台版本" } } });
  const confirmed = await assessRequirementPortfolio(root);
  assert.equal(confirmed.assessment.requirements[0].reviewStatus, "CONFIRMED");
  assert.ok((confirmed.assessment.requirements[0].finalPriorityScore ?? 0) > 0);
  assert.match(await readFile(confirmed.markdownPath, "utf8"), /P[0-3]/);
});

test("v1.7.0 识别跨需求依赖、冲突、重叠和共享回归范围", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-relations-"));
  await json(path.join(root, "project.json"), { projectId: "base-platform" });
  const left = path.join(root, "requirements", "REQ-401-organization-model");
  const right = path.join(root, "requirements", "REQ-402-organization-permission");
  for (const [dir, id, name, option] of [[left, "REQ-401", "organization-model", "platform-enhancement"], [right, "REQ-402", "organization-permission", "product-extension"]]) {
    await json(path.join(dir, "requirement.json"), { requirementId: id, requirementName: name, productVersion: "2.4.0", revision: 1 });
    await json(path.join(dir, "02-product-outline/solution-options/solution-decision.json"), { status: "selected", selectedOptionId: option });
    await json(path.join(dir, "02-product-outline/design-units/design-unit-plan.json"), { units: [{ moduleId: "module.organization" }, { moduleId: "module.permission" }] });
    await json(path.join(dir, "12-acceptance/complex-requirement/acceptance-report.json"), { status: "PASS" });
  }
  await json(path.join(left, "00-platform-analysis/cross-module-impact/module-impact-report.json"), { impacts: [{ moduleId: "module.organization", level: "DIRECT" }, { moduleId: "module.permission", level: "REGRESSION" }], dependencyEdges: [] });
  await json(path.join(right, "00-platform-analysis/cross-module-impact/module-impact-report.json"), { impacts: [{ moduleId: "module.organization", level: "INDIRECT" }, { moduleId: "module.permission", level: "DIRECT" }], dependencyEdges: [] });
  const result = await analyzePortfolioRelationships(root);
  const types = new Set(result.analysis.relationships.map((item) => item.type));
  assert.ok(types.has("depends-on")); assert.ok(types.has("enables")); assert.ok(types.has("overlaps-with")); assert.ok(types.has("shares-regression-scope")); assert.ok(types.has("should-bundle-with"));
  assert.ok(result.analysis.summary.blocker >= 1);
  assert.match(await readFile(result.graphPath, "utf8"), /flowchart TD/);
});

test("v1.7.0 生成三类版本方案并由产品经理显式选择", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-release-options-"));
  await json(path.join(root, "project.json"), { projectId: "base-platform" });
  for (const [id, name, modules] of [["REQ-501", "organization", ["module.organization"]], ["REQ-502", "permission", ["module.permission"]]]) {
    const dir = path.join(root, "requirements", `${id}-${name}`);
    await json(path.join(dir, "requirement.json"), { requirementId: id, requirementName: name, productVersion: "2.5.0", revision: 1 });
    await json(path.join(dir, "02-product-outline/solution-options/solution-decision.json"), { status: "selected", selectedOptionId: "platform-enhancement" });
    await json(path.join(dir, "02-product-outline/design-units/design-unit-plan.json"), { units: modules.map((moduleId) => ({ moduleId })) });
    await json(path.join(dir, "12-acceptance/complex-requirement/acceptance-report.json"), { status: "PASS" });
    await json(path.join(dir, "00-platform-analysis/cross-module-impact/module-impact-report.json"), { impacts: modules.map((moduleId) => ({ moduleId, level: "DIRECT" })), dependencyEdges: [] });
  }
  const generated = await generateReleaseOptions(root, "2.5.0");
  assert.deepEqual(generated.optionSet.options.map((item) => item.id), ["foundation-first", "value-first", "risk-control"]);
  const selected = await selectReleaseScope(root, "2.5.0", "foundation-first", ["REQ-501", "REQ-502"]);
  assert.equal(selected.decision.status, "selected");
  assert.deepEqual(selected.decision.includedRequirementIds, ["REQ-501", "REQ-502"]);
});

test("v1.7.0 版本范围缺少前置依赖时阻断选择", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-release-dependency-"));
  await json(path.join(root, "project.json"), { projectId: "base-platform" });
  const base = path.join(root, "requirements", "REQ-601-organization"); const dependent = path.join(root, "requirements", "REQ-602-permission");
  for (const [dir, id, name, units] of [[base, "REQ-601", "organization", ["module.organization"]], [dependent, "REQ-602", "permission", ["module.organization", "module.permission"]]]) {
    await json(path.join(dir, "requirement.json"), { requirementId: id, requirementName: name, productVersion: "2.6.0", revision: 1 });
    await json(path.join(dir, "02-product-outline/solution-options/solution-decision.json"), { status: "selected", selectedOptionId: "platform-enhancement" });
    await json(path.join(dir, "02-product-outline/design-units/design-unit-plan.json"), { units: units.map((moduleId) => ({ moduleId })) });
    await json(path.join(dir, "12-acceptance/complex-requirement/acceptance-report.json"), { status: "PASS" });
  }
  await json(path.join(base, "00-platform-analysis/cross-module-impact/module-impact-report.json"), { impacts: [{ moduleId: "module.organization", level: "DIRECT" }], dependencyEdges: [] });
  await json(path.join(dependent, "00-platform-analysis/cross-module-impact/module-impact-report.json"), { impacts: [{ moduleId: "module.organization", level: "INDIRECT" }, { moduleId: "module.permission", level: "DIRECT" }], dependencyEdges: [] });
  await generateReleaseOptions(root, "2.6.0");
  await assert.rejects(() => selectReleaseScope(root, "2.6.0", "value-first", ["REQ-602"], ["REQ-601"]), /缺少前置依赖/);
});

test("v1.7.0 建立正式版本基线并检测需求修订变化", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-release-baseline-"));
  await json(path.join(root, "project.json"), { projectId: "base-platform" });
  const req = path.join(root, "requirements", "REQ-701-form-linkage");
  await json(path.join(req, "requirement.json"), { requirementId: "REQ-701", requirementName: "form-linkage", productVersion: "2.7.0", revision: 1 });
  await json(path.join(req, "02-product-outline/solution-options/solution-decision.json"), { status: "selected", selectedOptionId: "platform-enhancement" });
  await json(path.join(req, "02-product-outline/design-units/design-unit-plan.json"), { units: [{ moduleId: "module.form" }] });
  await json(path.join(req, "12-acceptance/complex-requirement/acceptance-report.json"), { status: "PASS" });
  await json(path.join(req, "00-platform-analysis/cross-module-impact/module-impact-report.json"), { impacts: [{ moduleId: "module.form", level: "DIRECT" }], dependencyEdges: [] });
  await generateReleaseOptions(root, "2.7.0"); await selectReleaseScope(root, "2.7.0", "foundation-first", ["REQ-701"]);
  const established = await establishReleaseBaseline(root, "2.7.0"); assert.equal(established.baseline.sequence, 1);
  await assert.rejects(() => establishReleaseBaseline(root, "2.7.0"), /禁止重复建立/);
  const current = await detectReleaseChanges(root, "2.7.0"); assert.equal(current.report.status, "CURRENT");
  await json(path.join(req, "requirement.json"), { requirementId: "REQ-701", requirementName: "form-linkage", productVersion: "2.7.0", revision: 2 });
  const changed = await detectReleaseChanges(root, "2.7.0");
  assert.equal(changed.report.status, "CHANGE_DETECTED"); assert.deepEqual(changed.report.changes.revisedRequirements, ["REQ-701"]); assert.equal(changed.report.invalidatedConfirmation, true);
});

test("v1.7.0 生成可追踪的正式版本规划交付包", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-release-delivery-"));
  await json(path.join(root, "project.json"), { projectId: "base-platform", projectName: "基础平台" });
  const req = path.join(root, "requirements", "REQ-801-report-permission");
  await json(path.join(req, "requirement.json"), { requirementId: "REQ-801", requirementName: "report-permission", productVersion: "2.8.0", revision: 1 });
  await json(path.join(req, "02-product-outline/solution-options/solution-decision.json"), { status: "selected", selectedOptionId: "platform-enhancement" });
  await json(path.join(req, "02-product-outline/design-units/design-unit-plan.json"), { units: [{ moduleId: "module.reporting" }, { moduleId: "module.permission" }] });
  await json(path.join(req, "12-acceptance/complex-requirement/acceptance-report.json"), { status: "PASS" });
  await json(path.join(req, "00-platform-analysis/cross-module-impact/module-impact-report.json"), { impacts: [{ moduleId: "module.reporting", level: "DIRECT" }, { moduleId: "module.permission", level: "INDIRECT" }], dependencyEdges: [] });
  const reviewPath = path.join(root, "product", "portfolio", "product-manager-review.json");
  await json(reviewPath, { schemaVersion: "1.7", reviews: { "REQ-801": { businessUrgency: 5, customerCoverage: 4, strategicAlignment: 5, note: "确认进入版本" } } });
  await generateReleaseOptions(root, "2.8.0"); await selectReleaseScope(root, "2.8.0", "foundation-first", ["REQ-801"]); await establishReleaseBaseline(root, "2.8.0");
  const result = await finalizeReleasePlanning(root, "2.8.0", "完善报表数据权限的平台通用能力");
  assert.equal(result.acceptance.status, "PASS");
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as { files: Array<{ name: string; sha256: string }> };
  assert.ok(manifest.files.some((item) => item.name === "requirement-matrix.md" && item.sha256.length === 64));
  assert.match(await readFile(path.join(result.directory, "release-plan.md"), "utf8"), /完善报表数据权限/);
});
