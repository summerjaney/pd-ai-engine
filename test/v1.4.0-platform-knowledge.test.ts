import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PlatformKnowledgeService } from "../src/platform-knowledge/service.js";
import { PlatformKnowledgeValidationError } from "../src/platform-knowledge/validator.js";

test("v1.4.0 loads the confirmed base-platform knowledge sample", async () => {
  const catalog = await new PlatformKnowledgeService().load(path.resolve("knowledge/platform"));
  assert.equal(catalog.schemaVersion, "1.4");
  assert.equal(catalog.product.id, "base-platform");
  assert.equal(catalog.entities.length, 4);
  assert.equal(catalog.byId.get("capability.organization.structure")?.status, "confirmed");
});

test("v1.4.0 searches only confirmed knowledge by default", async () => {
  const service = new PlatformKnowledgeService();
  const catalog = await service.load(path.resolve("knowledge/platform"));
  const result = service.search(catalog, "组织结构");
  assert.deepEqual(result.map((item) => item.id), ["capability.organization.structure"]);
});

test("v1.4.0 rejects a missing knowledge reference", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v140-"));
  await mkdir(path.join(directory, "capabilities"));
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({
    schemaVersion: "1.4", version: "1.4.0", product: { id: "base-platform", name: "基础平台", version: "3.0.0" }, entries: ["capabilities/a.json"],
  }));
  await writeFile(path.join(directory, "capabilities/a.json"), JSON.stringify({
    id: "capability.a", kind: "capability", name: "A", description: "A capability", version: "1.0.0", status: "confirmed", tags: [],
    source: { type: "product-manager", document: "manual" }, domain: "system", module: "a", level: "platform", supportedScenarios: [], constraints: [],
    references: [{ id: "pattern.missing", kind: "pattern" }],
  }));
  await assert.rejects(() => new PlatformKnowledgeService().load(directory), PlatformKnowledgeValidationError);
});

test("v1.4.0 rejects path traversal in the platform catalog", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v140-path-"));
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({
    schemaVersion: "1.4", version: "1.4.0", product: { id: "base-platform", name: "基础平台", version: "3.0.0" }, entries: ["../outside.json"],
  }));
  await assert.rejects(() => new PlatformKnowledgeService().load(directory), /路径越界/);
});
