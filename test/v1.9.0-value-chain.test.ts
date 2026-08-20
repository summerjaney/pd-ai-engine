import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DiscoveryService } from "../src/discovery/service.js";
import { MarketEvidenceService } from "../src/market-evidence/service.js";
import { ValueChainService } from "../src/value-chain/service.js";

async function json(file: string, value: unknown): Promise<void> { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

async function setup(root: string): Promise<{ evidence: string; discovery: string; requirement: string; metric: string }> {
  const evidence = path.join(root, "evidence"); const discovery = path.join(root, "discovery"); const requirement = path.join(root, "project", "requirements", "REQ-1901-role-experience"); const input = path.join(root, "evidence.json"); const metric = path.join(root, "metric.json");
  await json(input, { id: "customer.role-configuration", name: "角色配置反馈", type: "customer-feedback", source: "访谈纪要", collectedAt: "2026-08-19T00:00:00.000Z", sensitivity: "internal", summary: "管理员经常遗漏角色授权，完成配置需要反复核对。", locator: { recordId: "INT-1" } });
  await new MarketEvidenceService().add(evidence, input); const discoveryService = new DiscoveryService(); await discoveryService.derive(evidence, discovery);
  await discoveryService.review(evidence, discovery, "problem", "problem.customer.role-configuration", "confirmed"); await discoveryService.review(evidence, discovery, "opportunity", "opportunity.customer.role-configuration", "confirmed"); await discoveryService.review(evidence, discovery, "value-hypothesis", "value-hypothesis.customer.role-configuration", "confirmed");
  await json(path.join(requirement, "requirement.json"), { requirementId: "REQ-1901", requirementName: "role-experience" }); await writeFile(path.join(requirement, "00-requirement-input.md"), "# 角色授权体验优化\n\n减少角色配置遗漏。\n", "utf8");
  await json(metric, { id: "metric.role-configuration-completion", name: "角色配置一次完成率", definition: "一次配置后无需补充授权的角色配置占比", baseline: "待采集", target: "上线后提升 20%", observationWindow: "发布后 30 天", dataSource: "脱敏运营统计" });
  return { evidence, discovery, requirement, metric };
}

test("v1.9.0 仅允许已确认的发现项建立可校验需求价值链", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-value-chain-")); const data = await setup(root); const service = new ValueChainService();
  const linked = await service.link(data.requirement, data.discovery, { problemId: "problem.customer.role-configuration", opportunityId: "opportunity.customer.role-configuration", valueHypothesisId: "value-hypothesis.customer.role-configuration" }, data.metric);
  assert.equal(linked.chain.requirementId, "REQ-1901"); assert.equal(linked.chain.successMetric.id, "metric.role-configuration-completion");
  assert.equal((await service.check(data.requirement, data.discovery)).check.valid, true);
});

test("v1.9.0 需求输入或发现审核变化会使价值链失效", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-value-chain-stale-")); const data = await setup(root); const service = new ValueChainService();
  await service.link(data.requirement, data.discovery, { problemId: "problem.customer.role-configuration", opportunityId: "opportunity.customer.role-configuration", valueHypothesisId: "value-hypothesis.customer.role-configuration" }, data.metric);
  await writeFile(path.join(data.requirement, "00-requirement-input.md"), "# 角色授权体验优化\n\n新增授权核对能力。\n", "utf8");
  const changedRequirement = await service.check(data.requirement, data.discovery); assert.equal(changedRequirement.check.stale, true); assert.match(changedRequirement.check.issues.join("\n"), /需求输入已变化/);
});
