import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeCompetitor, buildCompetitorBacklog, createRequirementFromCompetitor, prioritizeCompetitorCandidates, reviewCompetitorFeature } from "../src/competitor-analysis/service.js";

async function json(file: string, value: unknown): Promise<void> { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

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

test("v1.8.0 经产品经理审核后将竞品功能转换为可追踪的标准需求", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-competitor-requirement-"));
  const profilePath = path.join(root, "competitor.json"); const baselinePath = path.join(root, "baseline.json"); const analysisDirectory = path.join(root, "analysis");
  await json(profilePath, { schemaVersion: "1.8", id: "weaver", name: "泛微", features: [{ id: "application-role", name: "应用角色", module: "权限", scenario: "为应用配置角色", actors: ["应用管理员"], operations: ["新建角色", "配置权限"], keywords: ["角色"], evidenceIds: ["E1"] }], evidence: [{ id: "E1", source: "公开文档", excerpt: "应用授权" }] });
  await json(baselinePath, { schemaVersion: "1.8", product: { id: "base-platform", name: "基础平台" }, capabilities: [{ id: "permission", name: "权限", module: "权限", keywords: ["权限"] }] });
  await analyzeCompetitor(profilePath, baselinePath, analysisDirectory);
  const projectDirectory = path.join(root, "base-platform"); await json(path.join(projectDirectory, "project.json"), { projectId: "base-platform", projectName: "基础平台", productVersion: "3.1.0" });
  await assert.rejects(() => createRequirementFromCompetitor(analysisDirectory, projectDirectory, "application-role", "REQ-1801", "application-role"), /尚未完成产品经理审核/);
  await reviewCompetitorFeature(analysisDirectory, "application-role", "adapt", "应用级角色与功能授权", "保持平台统一权限模型");
  const created = await createRequirementFromCompetitor(analysisDirectory, projectDirectory, "application-role", "REQ-1801", "application-role");
  assert.match(await readFile(created.inputPath, "utf8"), /产品经理决策：adapt/);
  assert.match(await readFile(created.inputPath, "utf8"), /不直接复制页面或实现/);
  const origin = JSON.parse(await readFile(path.join(created.requirementDirectory, "00-sources/competitor-origin/decision.json"), "utf8")) as { analysisHash: string };
  assert.equal(origin.analysisHash.length, 64);
});

test("v1.8.0 不允许将 reject 决策转换为需求且重新分析后旧审核失效", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-competitor-gate-")); const profilePath = path.join(root, "competitor.json"); const baselinePath = path.join(root, "baseline.json"); const analysisDirectory = path.join(root, "analysis");
  const profile = { schemaVersion: "1.8", id: "x", name: "X", features: [{ id: "f", name: "功能", module: "应用", scenario: "场景", actors: ["管理员"], operations: ["操作"], keywords: ["应用"], evidenceIds: ["E1"] }], evidence: [{ id: "E1", source: "公开文档", excerpt: "功能证据" }] };
  await json(profilePath, profile); await json(baselinePath, { schemaVersion: "1.8", product: { id: "base", name: "基础平台" }, capabilities: [] }); await analyzeCompetitor(profilePath, baselinePath, analysisDirectory);
  await reviewCompetitorFeature(analysisDirectory, "f", "reject", "不符合平台定位");
  const projectDirectory = path.join(root, "base"); await json(path.join(projectDirectory, "project.json"), { projectId: "base", projectName: "基础平台" });
  await assert.rejects(() => createRequirementFromCompetitor(analysisDirectory, projectDirectory, "f", "REQ-1", "feature"), /仅 adopt 或 adapt/);
  await new Promise((resolve) => setTimeout(resolve, 2)); await analyzeCompetitor(profilePath, baselinePath, analysisDirectory);
  await assert.rejects(() => createRequirementFromCompetitor(analysisDirectory, projectDirectory, "f", "REQ-1", "feature"), /审核已失效/);
});

test("v1.8.0 将产品经理优先级评估和已创建需求接入版本组合", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-competitor-backlog-")); const profilePath = path.join(root, "competitor.json"); const baselinePath = path.join(root, "baseline.json"); const analysisDirectory = path.join(root, "analysis");
  await json(profilePath, { schemaVersion: "1.8", id: "weaver", name: "泛微", features: [{ id: "role", name: "应用角色", module: "权限", scenario: "配置应用角色", actors: ["管理员"], operations: ["授权"], keywords: ["角色"], evidenceIds: ["E1"] }], evidence: [{ id: "E1", source: "公开文档", excerpt: "应用角色" }] });
  await json(baselinePath, { schemaVersion: "1.8", product: { id: "base-platform", name: "基础平台" }, capabilities: [] }); await analyzeCompetitor(profilePath, baselinePath, analysisDirectory); await reviewCompetitorFeature(analysisDirectory, "role", "adopt", "应用角色与授权");
  const first = await prioritizeCompetitorCandidates(analysisDirectory); assert.equal(first.candidates[0]?.reviewStatus, "AWAITING_PM_REVIEW");
  const priorityFile = JSON.parse(await readFile(first.reviewPath, "utf8")) as { analysisHash: string; reviews: Record<string, unknown> };
  priorityFile.reviews.role = { userValue: 5, platformGenerality: 5, businessUrgency: 4, implementationComplexity: 2, architectureFit: 5, note: "进入近期版本" }; await json(first.reviewPath, priorityFile);
  const confirmed = await prioritizeCompetitorCandidates(analysisDirectory); assert.equal(confirmed.candidates[0]?.reviewStatus, "CONFIRMED"); assert.equal(confirmed.candidates[0]?.priorityBand, "P0");
  const projectDirectory = path.join(root, "base-platform"); await json(path.join(projectDirectory, "project.json"), { projectId: "base-platform", projectName: "基础平台", productVersion: "3.2.0" });
  await createRequirementFromCompetitor(analysisDirectory, projectDirectory, "role", "REQ-1802", "application-role");
  const backlog = await buildCompetitorBacklog(analysisDirectory, projectDirectory); assert.equal(backlog.backlog.summary.linked, 1); assert.equal(backlog.backlog.candidates[0]?.requirementId, "REQ-1802"); assert.equal(backlog.backlog.candidates[0]?.portfolioAdmissionStatus, "CONDITIONAL");
  assert.ok(backlog.portfolioPath); assert.match(await readFile(backlog.markdownPath, "utf8"), /REQ-1802/);
});
