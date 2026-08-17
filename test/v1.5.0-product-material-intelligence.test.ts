import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { ProductSourceService } from "../src/source-material/service.js";
import { compareMaterialCandidates, deriveMaterialKnowledge, writeMaterialComparison } from "../src/source-material/derivation.js";
import { PlatformKnowledgeService } from "../src/platform-knowledge/service.js";
import type { MaterialKnowledgeDerivation } from "../src/source-material/types.js";

test("v1.5.0 registers sensitive product material with a stable fingerprint and private-fixture gate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-source-"));
  const file = path.join(root, "platform-design.md");
  await writeFile(file, "# 组织机构\n\n组织编码必须唯一。\n");
  const service = new ProductSourceService();
  const source = await service.add(path.join(root, "catalog"), file, { type: "product-design", sensitivity: "confidential", product: "base-platform", version: "3.0.0" });
  assert.equal(source.format, "md");
  assert.match(source.contentFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(source.excludeFromPublicFixture, true);
  assert.equal((await service.loadCatalog(path.join(root, "catalog"))).sources[0].originalFileName, "platform-design.md");
});

test("v1.5.0 extracts Markdown sections and preserves source evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-md-"));
  const file = path.join(root, "design.md");
  await writeFile(file, "# 组织结构\n\n系统支持组织结构管理。\n\n## 规则\n\n组织编码必须唯一。\n");
  const service = new ProductSourceService();
  const source = await service.add(path.join(root, "sources"), file, { type: "product-design", sensitivity: "internal", product: "base-platform" });
  const output = await service.extract(path.join(root, "sources"), source.id);
  assert.equal(output.report.status, "extracted");
  assert.deepEqual(output.report.sections.map((item) => item.title), ["组织结构", "规则"]);
  assert.match(await readFile(output.markdownPath, "utf8"), /组织编码必须唯一/);
});

test("v1.5.0 extracts DOCX and PPTX XML into the same section contract", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-office-"));
  const service = new ProductSourceService();
  const cases = [
    { name: "design.docx", entry: "word/document.xml", xml: "<w:document><w:body><w:p><w:r><w:t>组织管理</w:t></w:r></w:p><w:p><w:r><w:t>系统支持组织维护。</w:t></w:r></w:p></w:body></w:document>" },
    { name: "architecture.pptx", entry: "ppt/slides/slide1.xml", xml: "<p:sld><a:p><a:r><a:t>产品架构</a:t></a:r></a:p><a:p><a:r><a:t>基础平台提供组织能力。</a:t></a:r></a:p></p:sld>" },
  ];
  for (const item of cases) {
    const file = path.join(root, item.name);
    const zip = new AdmZip(); zip.addFile(item.entry, Buffer.from(item.xml)); zip.writeZip(file);
    const source = await service.add(path.join(root, `sources-${item.name}`), file, { type: "product-design", sensitivity: "internal", product: "base-platform" });
    const output = await service.extract(path.join(root, `sources-${item.name}`), source.id);
    assert.equal(output.report.status, "extracted");
    assert.equal(output.report.sections.length, 1);
    assert.match(output.report.sections[0].content, /组织|产品架构/);
  }
});

test("v1.5.0 refuses to guess Axure RP proprietary content", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-rp-"));
  const file = path.join(root, "prototype.rp");
  await writeFile(file, "opaque binary placeholder");
  const service = new ProductSourceService();
  const source = await service.add(path.join(root, "sources"), file, { type: "prototype", sensitivity: "internal", product: "base-platform" });
  const output = await service.extract(path.join(root, "sources"), source.id);
  assert.equal(output.report.status, "manual-input-required");
  assert.match(output.report.warnings[0], /HTML 导出包|人工转录/);
  assert.equal(output.report.sections.length, 0);
});

test("v1.5.0 derives draft candidates only and keeps the product-manager gate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-derive-"));
  const extraction = path.join(root, "extraction.json");
  await writeFile(extraction, JSON.stringify({ schemaVersion: "1.5", extractedAt: "2026-08-17T00:00:00Z", status: "extracted", warnings: [],
    source: { id: "source.design", name: "平台设计说明书", type: "product-design", format: "md", product: "base-platform", sensitivity: "internal", originalFileName: "design.md", storedPath: "originals/design.md", contentFingerprint: "sha256:source", registeredAt: "2026-08-17T00:00:00Z", excludeFromPublicFixture: true },
    sections: [{ id: "section-1", title: "组织结构", locator: { section: "组织结构" }, content: "系统支持组织结构管理。组织编码必须唯一。页面使用组织树和数据表格组件。" }],
  }));
  const output = await deriveMaterialKnowledge(extraction);
  assert.ok(output.report.candidates.length >= 3);
  assert.ok(output.report.candidates.every((item) => item.status === "draft" && item.entity.status === "draft"));
  assert.match(await readFile(output.markdownPath, "utf8"), /必须由产品经理复核/);
});

test("v1.5.0 comparison detects duplicates without overwriting formal knowledge", async () => {
  const catalog = await new PlatformKnowledgeService().load(path.resolve("knowledge/platform"));
  const existing = catalog.byId.get("constraint.organization.code-unique")!;
  const derivation: MaterialKnowledgeDerivation = { schemaVersion: "1.5", sourceId: "source.ldp", status: "pending-product-manager-review", generatedAt: "2026-08-17T00:00:00Z", candidates: [{
    id: existing.id, kind: existing.kind, status: "draft", confidence: "high", entity: { ...existing, status: "draft" }, evidence: { sourceId: "source.ldp", sectionId: "s1", sectionTitle: "规则", locator: { page: 28 }, excerpt: existing.description, contentFingerprint: "sha256:evidence" },
  }] };
  const report = compareMaterialCandidates(derivation, catalog);
  assert.equal(report.comparisons[0].decision, "duplicate");
  assert.equal(catalog.byId.get(existing.id)?.status, "confirmed");
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v150-compare-"));
  const output = await writeMaterialComparison(report, directory);
  assert.match(await readFile(output.markdownPath, "utf8"), /不会自动覆盖正式知识/);
});

test("v1.5.0 rejects duplicate source IDs and path escape is not persisted", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-safety-"));
  const file = path.join(root, "same.md");
  await writeFile(file, "# A\n\n系统支持A管理。\n");
  const sourceRoot = path.join(root, "sources");
  const service = new ProductSourceService();
  await service.add(sourceRoot, file, { type: "product-design", sensitivity: "internal", product: "base-platform" });
  await assert.rejects(() => service.add(sourceRoot, file, { type: "product-design", sensitivity: "internal", product: "base-platform" }), /ID 已存在/);
  const catalog = await service.loadCatalog(sourceRoot);
  catalog.sources[0].storedPath = "../outside.md";
  await writeFile(path.join(sourceRoot, "source-catalog.json"), JSON.stringify(catalog));
  await assert.rejects(() => service.extract(sourceRoot, catalog.sources[0].id), /路径越界/);
});
