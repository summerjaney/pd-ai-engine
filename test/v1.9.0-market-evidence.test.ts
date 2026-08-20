import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { MarketEvidenceService } from "../src/market-evidence/service.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");

async function json(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const publicEvidence = {
  id: "competitor.application-role", name: "竞品应用角色证据", type: "competitor", source: "公开产品文档", collectedAt: "2026-08-19T00:00:00.000Z", sensitivity: "public", summary: "竞品支持在应用范围内配置角色和功能权限。", locator: { url: "https://example.test/application-role", section: "应用角色" },
};

test("v1.9.0 登记市场证据并建立可校验的内容指纹", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-market-evidence-"));
  const input = path.join(root, "evidence.json"); await json(input, publicEvidence);
  const service = new MarketEvidenceService();
  const added = await service.add(path.join(root, "catalog"), input);
  assert.equal(added.evidence.schemaVersion, "1.9");
  assert.equal(added.evidence.contentFingerprint.length, 64);
  assert.equal(added.evidence.excludeFromPublicDelivery, false);
  const loaded = await service.load(path.join(root, "catalog"));
  assert.equal(loaded.evidence[0]?.id, publicEvidence.id);
  const catalogPath = path.join(root, "catalog", "market-evidence-catalog.json");
  const tampered = JSON.parse(await readFile(catalogPath, "utf8")) as { evidence: Array<{ summary: string }> };
  tampered.evidence[0]!.summary = "被篡改的内容"; await json(catalogPath, tampered);
  await assert.rejects(() => service.load(path.join(root, "catalog")), /内容指纹不一致/);
});

test("v1.9.0 拒绝缺少引用定位或非法敏感级别的证据", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-market-evidence-invalid-"));
  const service = new MarketEvidenceService();
  await json(path.join(root, "missing-locator.json"), { ...publicEvidence, id: "missing-locator", locator: {} });
  await assert.rejects(() => service.add(path.join(root, "catalog"), path.join(root, "missing-locator.json")), /必须提供 locator/);
  await json(path.join(root, "bad-sensitivity.json"), { ...publicEvidence, id: "bad-sensitivity", sensitivity: "secret" });
  await assert.rejects(() => service.add(path.join(root, "catalog"), path.join(root, "bad-sensitivity.json")), /sensitivity 非法/);
});

test("v1.9.0 CLI 支持证据登记、查询和公开导出", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-market-evidence-cli-"));
  const evidenceDir = path.join(root, "market-evidence"); const input = path.join(root, "public.json"); const internal = path.join(root, "internal.json");
  await json(input, publicEvidence);
  await json(internal, { ...publicEvidence, id: "customer.role-confusion", name: "客户反馈", type: "customer-feedback", source: "客户访谈纪要", sensitivity: "confidential", locator: { recordId: "INT-001" } });
  const cli = path.join(repoRoot, "src", "cli.ts");
  const run = (args: string[]) => execFileAsync(process.execPath, ["--import", "tsx", cli, ...args], { cwd: repoRoot, timeout: 30_000 });
  const added = await run(["evidence", "add", input, "--evidence-dir", evidenceDir]); assert.match(added.stdout, /市场证据登记：PASS/);
  await run(["evidence", "add", internal, "--evidence-dir", evidenceDir]);
  const listed = await run(["evidence", "list", "--evidence-dir", evidenceDir]); assert.match(listed.stdout, /competitor\.application-role/);
  const exported = path.join(root, "public-export.json"); await run(["evidence", "export-public", "--evidence-dir", evidenceDir, "--out", exported]);
  const result = JSON.parse(await readFile(exported, "utf8")) as { evidence: Array<{ id: string }> };
  assert.deepEqual(result.evidence.map((item) => item.id), ["competitor.application-role"]);
});
