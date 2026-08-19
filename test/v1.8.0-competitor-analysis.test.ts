import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeCompetitor } from "../src/competitor-analysis/service.js";

async function json(file: string, value: unknown): Promise<void> { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

test("v1.8.0 生成带证据与人工复核门禁的竞品能力对标", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-competitor-"));
  const profilePath = path.join(root, "competitor.json"); const baselinePath = path.join(root, "baseline.json");
  await json(profilePath, { schemaVersion: "1.8", id: "weaver", name: "泛微", features: [
    { id: "role", name: "应用角色", module: "权限", scenario: "配置应用角色", actors: ["管理员"], operations: ["授权"], keywords: ["角色", "权限"], evidenceIds: ["E1"] },
    { id: "ai", name: "智能搭建", module: "AI", scenario: "自然语言生成应用", actors: ["开发者"], operations: ["生成"], keywords: ["自然语言", "生成应用"], evidenceIds: ["E2"] }
  ], evidence: [{ id: "E1", source: "公开文档", excerpt: "应用角色" }, { id: "E2", source: "公开文档", excerpt: "自然语言生成应用" }] });
  await json(baselinePath, { schemaVersion: "1.8", product: { id: "base", name: "基础平台" }, capabilities: [{ id: "permission-role", name: "角色权限", module: "权限", keywords: ["角色", "权限"] }] });
  const result = await analyzeCompetitor(profilePath, baselinePath, path.join(root, "out"));
  assert.equal(result.report.summary.total, 2); assert.equal(result.report.summary.available, 1); assert.equal(result.report.summary.missing, 1);
  assert.equal(result.report.assessments[0]?.decision, "research"); assert.equal(result.report.assessments[1]?.decision, "adopt");
  assert.ok(result.report.assessments.every((item) => item.requiresProductManagerReview));
  assert.match(await readFile(result.markdownPath, "utf8"), /不能自动写入正式平台知识/);
});

test("v1.8.0 拒绝没有有效证据的竞品功能", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-competitor-invalid-"));
  const profilePath = path.join(root, "competitor.json"); const baselinePath = path.join(root, "baseline.json");
  await json(profilePath, { schemaVersion: "1.8", id: "x", name: "X", features: [{ id: "f", name: "功能", module: "应用", scenario: "场景", actors: [], operations: [], keywords: [], evidenceIds: ["missing"] }], evidence: [] });
  await json(baselinePath, { schemaVersion: "1.8", product: { id: "base", name: "基础平台" }, capabilities: [] });
  await assert.rejects(() => analyzeCompetitor(profilePath, baselinePath, path.join(root, "out")), /缺少有效证据/);
});
