import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acceptProductBaseline, buildInitialProductBaseline, calculateProductBaselineHash, loadProductBaseline } from "../src/product-baseline/service.js";
import { analyzeChangeImpact } from "../src/change-impact/service.js";
import type { PrototypeDsl, RequirementContext } from "../src/domain/types.js";

const first: RequirementContext = { projectId: "base-platform", projectName: "基础平台", productVersion: "1.0.0", requirementId: "REQ-001", requirementName: "users", revision: 1 };
const second: RequirementContext = { ...first, productVersion: "1.1.0", requirementId: "REQ-002", requirementName: "user-import" };
const input = { sourcePath: "requirement.md", title: "用户批量导入", content: "# 用户批量导入\n\n新增批量导入页面。" };

function prototype(includeImport = false): PrototypeDsl {
  const pages: PrototypeDsl["pages"] = [{ id: "user-list", name: "用户列表", route: "/users", pattern: "list", fields: [{ id: "account", label: "账号", type: "text", required: true }], actions: [{ id: "create", label: "新增", kind: "primary", roles: ["admin"] }] }];
  if (includeImport) pages.push({ id: "user-import", name: "批量导入用户", route: "/users/import", pattern: "form", fields: [{ id: "file", label: "导入文件", type: "text", required: true }], actions: [{ id: "submit", label: "导入", kind: "primary", roles: ["admin"] }] });
  return { schemaVersion: "0.2", product: { name: "基础平台", description: "企业基础能力" }, navigation: [{ label: "用户管理", pageId: "user-list", roles: ["admin"] }], pages, rules: [{ id: "account-unique", description: "账号必须唯一", appliesTo: ["account"] }], transitions: [], errorFeedback: { validationMessage: "校验失败", operationFailureMessage: "操作失败", recoveryAction: "重试" }, designTokens: { colors: { primary: "#000", success: "#000", danger: "#000", warning: "#000", bgPage: "#fff", bgCard: "#fff", textPrimary: "#000", textSecondary: "#000", border: "#000" }, spacing: { s8: 8, s12: 12, s16: 16, s20: 20, s24: 24, s32: 32, s40: 40 }, radius: { r8: 8, r12: 12, r16: 16, r24: 24 }, typography: { fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 28 }, fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 }, lineHeight: { xs: 16, sm: 20, md: 24, lg: 28, xl: 32, xxl: 36 } } } };
}

async function fixture(): Promise<{ root: string; project: string; requirement: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-accept-")); const project = path.join(root, "base-platform"); const requirement = path.join(project, "requirements", "REQ-002-user-import");
  await Promise.all([mkdir(path.join(project, "product"), { recursive: true }), mkdir(path.join(requirement, "06-prototype"), { recursive: true }), mkdir(path.join(requirement, "11-change-impact"), { recursive: true })]);
  const initial = buildInitialProductBaseline(prototype(), first, "2026-08-12T00:00:00.000Z"); const proposed = prototype(true); const report = analyzeChangeImpact(initial, proposed, input, second);
  await Promise.all([
    writeFile(path.join(project, "product", "product-baseline.json"), JSON.stringify(initial), "utf8"),
    writeFile(path.join(requirement, "06-prototype", "prototype.json"), JSON.stringify(proposed), "utf8"),
    writeFile(path.join(requirement, "11-change-impact", "change-impact-report.json"), JSON.stringify(report), "utf8"),
    writeFile(path.join(requirement, "requirement.json"), JSON.stringify(second), "utf8"),
  ]);
  return { root, project, requirement };
}

test("TC-110-014: 显式接受递增基线并保留未受影响页面", async () => {
  const value = await fixture(); const result = await acceptProductBaseline(value.requirement); const baseline = await loadProductBaseline(value.project);
  assert.equal(result.previousSequence, 1); assert.equal(result.sequence, 2); assert.equal(baseline?.pages.length, 2); assert.ok(baseline?.pages.some((page) => page.id === "user-list")); assert.equal(baseline?.requirements.length, 2); assert.equal(baseline?.baseline.hash, calculateProductBaselineHash(baseline));
});

test("TC-110-015: 接受前保存可校验的完整历史快照", async () => {
  const value = await fixture(); const before = await readFile(path.join(value.project, "product", "product-baseline.json"), "utf8"); const result = await acceptProductBaseline(value.requirement);
  assert.equal(await readFile(result.snapshotPath, "utf8"), before); assert.equal(JSON.parse(await readFile(path.join(value.requirement, "11-change-impact", "acceptance.json"), "utf8")).status, "accepted");
});

test("TC-110-016: 产品级成果随接受后的单一基线更新", async () => {
  const value = await fixture(); await acceptProductBaseline(value.requirement);
  const [overview, architecture, roadmap, index, log] = await Promise.all(["product-overview.md", "product-architecture.md", "product-roadmap.md", "requirement-index.md", "change-log.md"].map((name) => readFile(path.join(value.project, "product", name), "utf8")));
  assert.match(overview, /正式基线：#2/); assert.match(architecture, /用户管理/); assert.match(roadmap, /REQ-002/); assert.match(index, /accepted/); assert.match(log, /基线 #2/);
});

test("TC-110-017: 过期影响分析和重复接受均被拒绝", async () => {
  const value = await fixture(); const reportPath = path.join(value.requirement, "11-change-impact", "change-impact-report.json"); const report = JSON.parse(await readFile(reportPath, "utf8")); report.baseline.hash = "0".repeat(64); await writeFile(reportPath, JSON.stringify(report), "utf8");
  await assert.rejects(() => acceptProductBaseline(value.requirement), /过期产品基线/); report.baseline.hash = (await loadProductBaseline(value.project))?.baseline.hash; await writeFile(reportPath, JSON.stringify(report), "utf8"); await acceptProductBaseline(value.requirement); await assert.rejects(() => acceptProductBaseline(value.requirement), /过期产品基线|已被接受/);
});

test("TC-110-018: ERROR 冲突不可通过显式接受绕过", async () => {
  const value = await fixture(); const reportPath = path.join(value.requirement, "11-change-impact", "change-impact-report.json"); const report = JSON.parse(await readFile(reportPath, "utf8")); report.summary.error = 1; await writeFile(reportPath, JSON.stringify(report), "utf8");
  await assert.rejects(() => acceptProductBaseline(value.requirement), /包含 1 个 ERROR/); assert.equal((await loadProductBaseline(value.project))?.baseline.sequence, 1);
});
