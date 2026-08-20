import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ReleaseObjectiveService } from "../src/release-objective/service.js";

async function json(file: string, value: unknown): Promise<void> { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

async function setup(root: string): Promise<{ project: string; input: string }> {
  const project = path.join(root, "project"); const release = path.join(project, "releases", "v3.3.0"); const input = path.join(root, "objective.json");
  await json(path.join(release, "release-scope-decision.json"), { schemaVersion: "1.7", productVersion: "3.3.0", status: "selected", optionSetFingerprint: "a", selectedOptionId: "value-first", includedRequirementIds: ["REQ-1901"], deferredRequirementIds: [], selectedAt: "2026-08-19T00:00:00.000Z", selectedBy: "product-manager" });
  await json(input, { objective: "提升应用级角色配置体验", targetUsers: ["平台管理员"], opportunityIds: ["opportunity.customer.role-configuration"], metrics: [{ id: "metric.role-completion", name: "一次配置完成率", definition: "无需补充授权的配置占比", baseline: "60%", target: "80%", observationWindow: "发布后30天", dataSource: "运营统计" }], owner: "产品负责人" });
  return { project, input };
}

test("v1.9.0 版本目标绑定已选择的范围并校验成功指标", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-release-objective-")); const { project, input } = await setup(root); const service = new ReleaseObjectiveService();
  const saved = await service.set(project, "3.3.0", input); assert.equal(saved.objective.metrics[0]?.target, "80%");
  assert.equal((await service.check(project, "3.3.0")).check.valid, true);
});

test("v1.9.0 版本范围变化会使版本目标确认失效", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-release-objective-stale-")); const { project, input } = await setup(root); const service = new ReleaseObjectiveService(); await service.set(project, "3.3.0", input);
  await json(path.join(project, "releases", "v3.3.0", "release-scope-decision.json"), { schemaVersion: "1.7", productVersion: "3.3.0", status: "selected", optionSetFingerprint: "b", selectedOptionId: "risk-control", includedRequirementIds: ["REQ-1901"], deferredRequirementIds: [], selectedAt: "2026-08-19T01:00:00.000Z", selectedBy: "product-manager" });
  const checked = await service.check(project, "3.3.0"); assert.equal(checked.check.stale, true); assert.match(checked.check.issues.join("\n"), /版本范围已变化/);
});
