import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRequirementPortfolio } from "../src/release-portfolio/service.js";

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
