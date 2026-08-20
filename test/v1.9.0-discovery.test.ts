import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { DiscoveryService } from "../src/discovery/service.js";
import { MarketEvidenceService } from "../src/market-evidence/service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
async function json(file: string, value: unknown): Promise<void> { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

async function setup(root: string): Promise<{ evidenceDirectory: string; discoveryDirectory: string; input: string }> {
  const evidenceDirectory = path.join(root, "evidence"); const discoveryDirectory = path.join(root, "discovery"); const input = path.join(root, "evidence.json");
  await json(input, { id: "customer.role-configuration", name: "角色配置客户反馈", type: "customer-feedback", source: "客户访谈纪要", collectedAt: "2026-08-19T00:00:00.000Z", sensitivity: "internal", summary: "管理员反馈角色权限配置步骤复杂，容易遗漏关键功能授权。", locator: { recordId: "INT-ROLE-001" } });
  await new MarketEvidenceService().add(evidenceDirectory, input);
  return { evidenceDirectory, discoveryDirectory, input };
}

test("v1.9.0 由有效证据生成可追溯的问题、机会与价值假设草稿", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-discovery-")); const { evidenceDirectory, discoveryDirectory } = await setup(root);
  const result = await new DiscoveryService().derive(evidenceDirectory, discoveryDirectory);
  assert.equal(result.report.status, "pending-product-manager-review");
  assert.equal(result.report.problems[0]?.value.evidenceIds[0], "customer.role-configuration");
  assert.equal(result.report.opportunities[0]?.value.problemIds[0], "problem.customer.role-configuration");
  assert.match(await readFile(result.markdownPath, "utf8"), /只有产品经理明确确认/);
});

test("v1.9.0 产品经理审核保留确认，并在证据变更后强制失效", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-discovery-gate-")); const { evidenceDirectory, discoveryDirectory, input } = await setup(root); const service = new DiscoveryService();
  await service.derive(evidenceDirectory, discoveryDirectory);
  const reviewed = await service.review(evidenceDirectory, discoveryDirectory, "problem", "problem.customer.role-configuration", "confirmed", "确认是高频管理痛点");
  assert.equal(reviewed.report.problems[0]?.review.status, "confirmed");
  await json(input, { id: "customer.role-configuration-v2", name: "角色配置客户反馈（更新）", type: "customer-feedback", source: "客户访谈纪要", collectedAt: "2026-08-19T00:00:00.000Z", sensitivity: "internal", summary: "管理员反馈角色权限配置步骤复杂，且无法快速核对遗漏授权。", locator: { recordId: "INT-ROLE-002" } });
  await new MarketEvidenceService().add(evidenceDirectory, input);
  assert.equal((await service.status(evidenceDirectory, discoveryDirectory)).stale, true);
  await assert.rejects(() => service.review(evidenceDirectory, discoveryDirectory, "problem", "problem.customer.role-configuration", "confirmed"), /审核已失效/);
  const regenerated = await service.derive(evidenceDirectory, discoveryDirectory);
  assert.equal(regenerated.report.problems[0]?.review.status, "pending");
});

test("v1.9.0 CLI 完成发现草稿、审核与状态查看", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-discovery-cli-")); const { evidenceDirectory, discoveryDirectory } = await setup(root); const cli = path.join(repoRoot, "src", "cli.ts");
  const run = (args: string[]) => execFileAsync(process.execPath, ["--import", "tsx", cli, ...args], { cwd: repoRoot, timeout: 30_000 });
  const derived = await run(["discovery", "derive", "--evidence-dir", evidenceDirectory, "--discovery-dir", discoveryDirectory]); assert.match(derived.stdout, /市场发现草稿：pending-product-manager-review/);
  await run(["discovery", "review", "--evidence-dir", evidenceDirectory, "--discovery-dir", discoveryDirectory, "--kind", "problem", "--id", "problem.customer.role-configuration", "--action", "confirm"]);
  const status = await run(["discovery", "status", "--evidence-dir", evidenceDirectory, "--discovery-dir", discoveryDirectory]); assert.match(status.stdout, /待审核\/已确认\/已拒绝：2\/1\/0/);
});
