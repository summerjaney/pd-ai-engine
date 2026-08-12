import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import type { PrototypeDsl, RequirementContext } from "../src/domain/types.js";
import {
  buildInitialProductBaseline,
  calculateProductBaselineHash,
  establishInitialProductBaseline,
  loadProductBaseline,
  validateProductBaseline,
} from "../src/product-baseline/service.js";

const execFileAsync = promisify(execFile);

const requirement: RequirementContext = {
  projectId: "base-platform",
  projectName: "基础平台",
  productVersion: "1.1.0",
  requirementId: "REQ-001",
  requirementName: "user-management",
  revision: 1,
};

const prototype: PrototypeDsl = {
  schemaVersion: "0.2",
  product: { name: "基础平台", description: "企业级基础能力" },
  navigation: [{ label: "用户管理", pageId: "user-list", roles: ["admin"] }],
  pages: [{
    id: "user-list",
    name: "用户列表",
    route: "/users",
    pattern: "list",
    fields: [{ id: "username", label: "用户名", type: "text", required: true }],
    actions: [{ id: "create-user", label: "新增用户", kind: "primary", roles: ["admin"] }],
    pagination: { enabled: true, pageSize: 20 },
    emptyState: { description: "暂无用户" },
  }],
  rules: [{ id: "unique-username", description: "用户名唯一", appliesTo: ["username"] }],
  transitions: [],
  designTokens: {
    colors: {}, spacing: {}, radius: {},
    typography: { fontSize: {}, fontWeight: {}, lineHeight: {} },
  },
};

test("TC-110-001: 首次需求生成带稳定 ID、来源和哈希的产品基线", () => {
  const baseline = buildInitialProductBaseline(prototype, requirement, "2026-08-12T00:00:00.000Z");
  assert.equal(baseline.schemaVersion, "1.1");
  assert.equal(baseline.pages[0].id, "user-list");
  assert.equal(baseline.pages[0].fields[0].source.requirementId, "REQ-001");
  assert.equal(baseline.baseline.hash, calculateProductBaselineHash(baseline));
  assert.deepEqual(validateProductBaseline(baseline), { valid: true, issues: [] });
});

test("TC-110-002: 首次建立基线后普通运行不会覆盖正式基线", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-baseline-"));
  const projectDirectory = path.join(root, "base-platform");
  const requirementDirectory = path.join(projectDirectory, "requirements", "REQ-001-user-management");
  await mkdir(path.join(requirementDirectory, "06-prototype"), { recursive: true });
  await writeFile(path.join(requirementDirectory, "06-prototype", "prototype.json"), JSON.stringify(prototype), "utf8");

  const first = await establishInitialProductBaseline(projectDirectory, requirementDirectory, requirement);
  const original = await readFile(path.join(projectDirectory, "product", "product-baseline.json"), "utf8");
  const changedPrototype = { ...prototype, product: { ...prototype.product, description: "不应覆盖" } };
  await writeFile(path.join(requirementDirectory, "06-prototype", "prototype.json"), JSON.stringify(changedPrototype), "utf8");
  const second = await establishInitialProductBaseline(projectDirectory, requirementDirectory, requirement);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(await readFile(path.join(projectDirectory, "product", "product-baseline.json"), "utf8"), original);
});

test("TC-110-003: 损坏或篡改的产品基线会被拒绝", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-baseline-invalid-"));
  const productDirectory = path.join(root, "product");
  await mkdir(productDirectory, { recursive: true });
  const baseline = buildInitialProductBaseline(prototype, requirement);
  baseline.product.name = "已被篡改";
  await writeFile(path.join(productDirectory, "product-baseline.json"), JSON.stringify(baseline), "utf8");
  await assert.rejects(() => loadProductBaseline(root), /哈希不匹配/);
});

test("TC-110-004: requirement create 完整运行后在项目级目录建立产品基线", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-baseline-cli-"));
  const requirementPath = path.join(root, "requirement.md");
  const outputRoot = path.join(root, "output");
  await writeFile(requirementPath, "# 用户管理\n\n管理员可以查看并新增用户。\n", "utf8");
  const { stdout } = await execFileAsync(process.execPath, [
    "--import", "tsx", "src/cli.ts", "requirement", "create", requirementPath,
    "--project", "base-platform", "--project-name", "基础平台",
    "--id", "REQ-001", "--name", "user-management",
    "--product-version", "1.1.0", "--output-root", outputRoot,
  ], { cwd: path.resolve("."), timeout: 30_000 });
  const baseline = await loadProductBaseline(path.join(outputRoot, "base-platform"));
  assert.match(stdout, /产品基线已建立/);
  assert.equal(baseline?.requirements[0].id, "REQ-001");
  assert.ok((baseline?.pages.length ?? 0) > 0);
});
