import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { composeExtensionContext, discoverExtensions, loadExtension, validateExtensionManifest } from "../src/extensions/service.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("TC-120-001: 扩展清单执行结构、类型和安全路径校验", () => {
  const result = validateExtensionManifest({ schemaVersion: "1.2", id: "Bad ID", name: "", type: "unknown", version: "1", compatibleWith: {}, provides: { rules: ["../secret.json"] } });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.path === "id"));
  assert.ok(result.issues.some((issue) => issue.path === "provides.rules"));
});

test("TC-120-002: 加载低代码领域扩展并为每项资源保留来源", async () => {
  const extension = await loadExtension(path.join(repositoryRoot, "domains", "lowcode-platform"));
  assert.equal(extension.manifest.id, "lowcode-platform");
  assert.equal(extension.resources.length, 7);
  assert.ok(extension.resources.every((resource) => resource.source.extensionId === "lowcode-platform"));
  assert.ok(extension.resources.some((resource) => resource.id === "lowcode.platform-boundary"));
});

test("TC-120-003: 扩展发现忽略不含清单的普通目录", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-extensions-"));
  await mkdir(path.join(root, "ordinary"));
  const extensionRoot = path.join(root, "demo");
  await mkdir(extensionRoot);
  await writeFile(path.join(extensionRoot, "extension.json"), JSON.stringify({ schemaVersion: "1.2", id: "demo", name: "Demo", type: "domain", version: "1.0.0", compatibleWith: { pae: ">=1.2.0" }, provides: {} }), "utf8");
  const extensions = await discoverExtensions(root);
  assert.deepEqual(extensions.map((item) => item.manifest.id), ["demo"]);
});

test("TC-120-004: 产品扩展按依赖顺序覆盖领域同名规则并记录冲突", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-compose-"));
  const domainRoot = path.join(root, "domain"); const productRoot = path.join(root, "product");
  await Promise.all([mkdir(path.join(domainRoot, "rules"), { recursive: true }), mkdir(path.join(productRoot, "rules"), { recursive: true })]);
  await writeFile(path.join(domainRoot, "extension.json"), JSON.stringify({ schemaVersion: "1.2", id: "domain", name: "领域", type: "domain", version: "1.0.0", compatibleWith: { pae: ">=1.2.0" }, provides: { rules: ["rules/form.json"] } }), "utf8");
  await writeFile(path.join(productRoot, "extension.json"), JSON.stringify({ schemaVersion: "1.2", id: "product", name: "产品", type: "product", version: "1.0.0", compatibleWith: { pae: ">=1.2.0" }, extends: ["domain"], provides: { rules: ["rules/form.json"] } }), "utf8");
  await writeFile(path.join(domainRoot, "rules", "form.json"), JSON.stringify({ id: "form-rule", statement: "领域默认" }), "utf8");
  await writeFile(path.join(productRoot, "rules", "form.json"), JSON.stringify({ id: "form-rule", statement: "产品特例" }), "utf8");
  const context = composeExtensionContext([await loadExtension(productRoot), await loadExtension(domainRoot)]);
  assert.deepEqual(context.extensions.map((item) => item.id), ["domain", "product"]);
  assert.equal(context.conflicts.length, 1);
  assert.equal(context.conflicts[0]?.selected.extensionId, "product");
  assert.deepEqual(context.resources.find((item) => item.id === "form-rule")?.value, { id: "form-rule", statement: "产品特例" });
});

test("TC-120-005: 缺失依赖和循环依赖均禁止组合", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-dependency-"));
  const create = async (id: string, dependencies: string[]) => {
    const target = path.join(root, id); await mkdir(target);
    await writeFile(path.join(target, "extension.json"), JSON.stringify({ schemaVersion: "1.2", id, name: id, type: "domain", version: "1.0.0", compatibleWith: { pae: ">=1.2.0" }, extends: dependencies, provides: {} }), "utf8");
    return loadExtension(target);
  };
  const missing = await create("missing-owner", ["absent"]);
  assert.throws(() => composeExtensionContext([missing]), /缺少依赖扩展/);
  const first = await create("first", ["second"]); const second = await create("second", ["first"]);
  assert.throws(() => composeExtensionContext([first, second]), /循环/);
});
