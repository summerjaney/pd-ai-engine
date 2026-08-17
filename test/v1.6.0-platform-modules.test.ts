import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PlatformModuleService } from "../src/platform-modules/service.js";
import { PlatformModuleValidationError } from "../src/platform-modules/validator.js";

test("v1.6.0 loads the base-platform module catalog", async () => {
  const catalog = await new PlatformModuleService().load(path.resolve("knowledge/platform/modules"));
  assert.equal(catalog.schemaVersion, "1.6");
  assert.equal(catalog.productId, "base-platform");
  assert.equal(catalog.modules.length, 5);
  assert.equal(catalog.byId.get("module.permission")?.dependencies[0]?.moduleId, "module.organization");
});

test("v1.6.0 builds a typed dependency graph", async () => {
  const service = new PlatformModuleService();
  const catalog = await service.load(path.resolve("knowledge/platform/modules"));
  const graph = service.graph(catalog);
  assert.equal(graph.nodes.length, 5);
  assert.ok(graph.edges.some((edge) => edge.from === "module.workflow" && edge.to === "module.form" && edge.type === "data"));
  assert.ok(graph.edges.some((edge) => edge.from === "module.reporting" && edge.to === "module.permission" && edge.type === "permission"));
});

test("v1.6.0 renders the dependency graph as Mermaid", async () => {
  const service = new PlatformModuleService();
  const rendered = service.renderMermaid(await service.load(path.resolve("knowledge/platform/modules")));
  assert.match(rendered, /^flowchart TD/m);
  assert.match(rendered, /权限管理/);
  assert.match(rendered, /-->|data|permission/);
});

test("v1.6.0 rejects an unknown module dependency", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-module-"));
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({ schemaVersion: "1.6", version: "1.6.0", productId: "base-platform", entries: ["a.json"] }));
  await writeFile(path.join(directory, "a.json"), JSON.stringify({
    id: "module.a", name: "A", description: "A", version: "1.0.0", status: "confirmed",
    responsibilities: [], coreObjects: [], capabilities: [], extensionPoints: [],
    dependencies: [{ moduleId: "module.missing", type: "data", description: "missing", required: true }],
    source: { document: "test" },
  }));
  await assert.rejects(() => new PlatformModuleService().load(directory), PlatformModuleValidationError);
});

test("v1.6.0 rejects module catalog path traversal", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-module-path-"));
  await mkdir(path.join(directory, "empty"));
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({ schemaVersion: "1.6", version: "1.6.0", productId: "base-platform", entries: ["../outside.json"] }));
  await assert.rejects(() => new PlatformModuleService().load(directory), /路径越界/);
});
