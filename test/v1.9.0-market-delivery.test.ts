import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DiscoveryService } from "../src/discovery/service.js";
import { finalizeMarketDelivery } from "../src/market-delivery/service.js";
import { MarketEvidenceService } from "../src/market-evidence/service.js";
import { ReleaseObjectiveService } from "../src/release-objective/service.js";
import { ReleaseRetrospectiveService } from "../src/release-retrospective/service.js";
import { ValueChainService } from "../src/value-chain/service.js";

async function json(file: string, value: unknown): Promise<void> { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

test("v1.9.0 端到端验收生成脱敏市场决策交付包", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-market-delivery-")); const project = path.join(root, "project"); const evidenceDir = path.join(root, "evidence"); const discoveryDir = path.join(root, "discovery"); const req = path.join(project, "requirements", "REQ-1901-role"); const release = path.join(project, "releases", "v3.3.0");
  const evidenceInput = path.join(root, "evidence.json"); await json(evidenceInput, { id: "customer.role", name: "角色配置反馈", type: "customer-feedback", source: "内部访谈原文", collectedAt: "2026-08-19T00:00:00.000Z", sensitivity: "confidential", summary: "配置角色时容易遗漏权限。", locator: { recordId: "INT-1" } }); await new MarketEvidenceService().add(evidenceDir, evidenceInput);
  const discovery = new DiscoveryService(); await discovery.derive(evidenceDir, discoveryDir); for (const [kind, id] of [["problem", "problem.customer.role"], ["opportunity", "opportunity.customer.role"], ["value-hypothesis", "value-hypothesis.customer.role"]] as const) await discovery.review(evidenceDir, discoveryDir, kind, id, "confirmed");
  await json(path.join(req, "requirement.json"), { requirementId: "REQ-1901" }); await writeFile(path.join(req, "00-requirement-input.md"), "# 角色体验\n\n优化角色授权。\n"); const metric = path.join(root, "metric.json"); await json(metric, { id: "metric.role", name: "完成率", definition: "配置完成率", baseline: "60%", target: "80%", observationWindow: "30天", dataSource: "运营统计" }); await new ValueChainService().link(req, discoveryDir, { problemId: "problem.customer.role", opportunityId: "opportunity.customer.role", valueHypothesisId: "value-hypothesis.customer.role" }, metric);
  await json(path.join(release, "release-scope-decision.json"), { schemaVersion: "1.7", productVersion: "3.3.0", status: "selected", optionSetFingerprint: "a", selectedOptionId: "value-first", includedRequirementIds: ["REQ-1901"], deferredRequirementIds: [], selectedAt: "2026-08-19T00:00:00.000Z", selectedBy: "product-manager" }); const objective = path.join(root, "objective.json"); await json(objective, { objective: "改善角色配置", targetUsers: ["管理员"], opportunityIds: ["opportunity.customer.role"], metrics: [{ id: "metric.role", name: "完成率", definition: "配置完成率", baseline: "60%", target: "80%", observationWindow: "30天", dataSource: "运营统计" }], owner: "产品负责人" }); await new ReleaseObjectiveService().set(project, "3.3.0", objective); const actual = path.join(root, "actual.json"); await json(actual, { results: [{ id: "metric.role", value: "75%", source: "运营统计", observationWindow: "30天" }] }); await new ReleaseRetrospectiveService().record(project, "3.3.0", actual);
  const delivery = await finalizeMarketDelivery(project, "3.3.0", evidenceDir, discoveryDir); assert.equal(delivery.acceptance.status, "PASS"); assert.equal((await readFile(delivery.zipPath)).subarray(0, 2).toString(), "PK"); const publicEvidence = JSON.parse(await readFile(path.join(release, "market-decision-delivery", "artifacts", "public-market-evidence.json"), "utf8")) as { evidence: unknown[] }; assert.equal(publicEvidence.evidence.length, 0);
});
