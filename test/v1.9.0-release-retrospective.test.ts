import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ReleaseObjectiveService } from "../src/release-objective/service.js";
import { ReleaseRetrospectiveService } from "../src/release-retrospective/service.js";

async function json(file: string, value: unknown): Promise<void> { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

test("v1.9.0 发布后复盘比较目标与实际结果但不修改版本决策", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-retrospective-")); const project = path.join(root, "project"); const release = path.join(project, "releases", "v3.3.0"); const objectiveInput = path.join(root, "objective.json"); const actualInput = path.join(root, "actual.json");
  const scope = { schemaVersion: "1.7", productVersion: "3.3.0", status: "selected", optionSetFingerprint: "a", selectedOptionId: "value-first", includedRequirementIds: ["REQ-1901"], deferredRequirementIds: [], selectedAt: "2026-08-19T00:00:00.000Z", selectedBy: "product-manager" };
  await json(path.join(release, "release-scope-decision.json"), scope);
  await json(objectiveInput, { objective: "改善角色配置", targetUsers: ["管理员"], opportunityIds: ["opportunity.role"], metrics: [{ id: "metric.completion", name: "一次配置完成率", definition: "无需补充配置的比例", baseline: "60%", target: "80%", observationWindow: "30天", dataSource: "运营数据" }], owner: "产品负责人" });
  await new ReleaseObjectiveService().set(project, "3.3.0", objectiveInput);
  await json(actualInput, { results: [{ id: "metric.completion", value: "75%", source: "脱敏运营数据", observationWindow: "发布后30天" }], note: "先观察一个完整周期" });
  const report = await new ReleaseRetrospectiveService().record(project, "3.3.0", actualInput);
  assert.equal(report.report.results[0]?.assessment, "not-met"); assert.match(report.report.results[0]?.suggestion ?? "", /未达到目标/);
  const scopeAfter = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(release, "release-scope-decision.json"), "utf8")); assert.deepEqual(scopeAfter, scope);
});
