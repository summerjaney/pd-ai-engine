import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { ProductSourceService } from "../src/source-material/service.js";
import { compareMaterialCandidates, deriveMaterialKnowledge, writeMaterialComparison } from "../src/source-material/derivation.js";
import { PlatformKnowledgeService } from "../src/platform-knowledge/service.js";
import type { MaterialKnowledgeDerivation } from "../src/source-material/types.js";
import { prepareMaterialPromotionPackage, promoteMaterialPackage } from "../src/source-material/promotion.js";
import { LlmMaterialKnowledgeExtractor } from "../src/source-material/extractor.js";
import type { LlmGenerationRequest, LlmGenerationResponse, LlmProvider, LlmProviderInfo } from "../src/llm/types.js";

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

test("v1.5.0 recognizes an Axure HTML export ZIP and extracts page text", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-axure-html-"));
  const file = path.join(root, "prototype.zip");
  const zip = new AdmZip();
  zip.addFile("index.html", Buffer.from("<html><title>Axure Prototype</title></html>"));
  zip.addFile("resources/scripts/axure/axure.js", Buffer.from("// axure"));
  zip.addFile("data/document.js", Buffer.from('loadDocument({"sitemap":{"rootNodes":[{"pageName":"组织机构","type":"Folder","children":[{"pageName":"组织结构","type":"Wireframe","url":"organization.html"},{"pageName":"用户管理","type":"Wireframe","url":"users.html"}]}]}});'));
  zip.addFile("pages/organization.html", Buffer.from("<html><head><title>组织结构</title></head><body><h1>组织结构</h1><p>页面支持组织树和组织列表管理。</p><a href=\"users.html\">用户管理</a></body></html>"));
  zip.addFile("pages/users.html", Buffer.from("<html><head><title>用户管理</title></head><body><h1>用户管理</h1><p>维护组织下的用户。</p></body></html>"));
  zip.writeZip(file);
  const service = new ProductSourceService();
  const source = await service.add(path.join(root, "sources"), file, { type: "prototype", sensitivity: "internal", product: "base-platform" });
  assert.equal(source.format, "axure-html");
  const output = await service.extract(path.join(root, "sources"), source.id);
  assert.equal(output.report.status, "extracted");
  const organization = output.report.sections.find((item) => item.title === "组织结构")!;
  const folder = output.report.sections.find((item) => item.title === "组织机构")!;
  const users = output.report.sections.find((item) => item.title === "用户管理")!;
  assert.match(organization.content, /组织树和组织列表管理/);
  assert.equal(organization.parentId, folder.id);
  assert.ok(output.report.relations?.some((item) => item.type === "parent-child" && item.from === folder.id && item.to === organization.id));
  assert.ok(output.report.relations?.some((item) => item.type === "links-to" && item.from === organization.id && item.to === users.id));
  assert.match(output.report.warnings.join(" "), /动态交互.*人工|真实画布验收/);
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

class MaterialTestProvider implements LlmProvider {
  calls = 0;
  constructor(private readonly responses: string[]) {}
  async generate(_request: Readonly<LlmGenerationRequest>): Promise<LlmGenerationResponse> {
    const content = this.responses[Math.min(this.calls, this.responses.length - 1)]; this.calls += 1;
    return { content, model: "material-test-model", provider: "mock" };
  }
  modelInfo(): LlmProviderInfo { return { id: "mock", model: "material-test-model" }; }
  async healthCheck(): Promise<void> {}
}

test("v1.5.0 LLM extractor retries invalid evidence and accepts only exact source quotes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-llm-"));
  const extractionPath = path.join(root, "extraction.json");
  await writeFile(extractionPath, JSON.stringify({ schemaVersion: "1.5", extractedAt: "2026-08-17T00:00:00Z", status: "extracted", warnings: [], relations: [],
    source: { id: "source.design", name: "平台设计说明书", type: "product-design", format: "md", product: "base-platform", version: "3.0.0", sensitivity: "internal", originalFileName: "design.md", storedPath: "originals/design.md", contentFingerprint: "sha256:source", registeredAt: "2026-08-17T00:00:00Z", excludeFromPublicFixture: true },
    sections: [{ id: "section-1", title: "组织规则", locator: { section: "组织规则" }, content: "组织编码必须在平台范围内唯一。" }],
  }));
  const provider = new MaterialTestProvider([
    JSON.stringify({ candidates: [{ kind: "constraint", name: "组织编码唯一", description: "组织编码必须唯一。", evidenceExcerpt: "模型虚构的证据", sectionId: "section-1", confidence: "high" }] }),
    JSON.stringify({ candidates: [{ kind: "constraint", name: "组织编码唯一", description: "组织编码必须在平台范围内唯一。", evidenceExcerpt: "组织编码必须在平台范围内唯一。", sectionId: "section-1", confidence: "high", severity: "error" }] }),
  ]);
  const output = await deriveMaterialKnowledge(extractionPath, undefined, { extractor: new LlmMaterialKnowledgeExtractor(provider, 2) });
  assert.equal(provider.calls, 2);
  assert.equal(output.report.extractor?.mode, "llm");
  assert.equal(output.report.extractor?.model, "material-test-model");
  assert.equal(output.report.candidates[0].evidence.excerpt, "组织编码必须在平台范围内唯一。");
});

test("v1.5.0 LLM extractor blocks hallucinated evidence after retries", async () => {
  const extraction = { schemaVersion: "1.5" as const, extractedAt: "2026-08-17T00:00:00Z", status: "extracted" as const, warnings: [], relations: [],
    source: { id: "source.design", name: "平台设计说明书", type: "product-design" as const, format: "md" as const, product: "base-platform", sensitivity: "internal" as const, originalFileName: "design.md", storedPath: "originals/design.md", contentFingerprint: "sha256:source", registeredAt: "2026-08-17T00:00:00Z", excludeFromPublicFixture: true },
    sections: [{ id: "section-1", title: "组织规则", locator: { section: "组织规则" }, content: "组织编码必须唯一。" }] };
  const invalid = JSON.stringify({ candidates: [{ kind: "constraint", name: "虚构规则", description: "虚构规则", evidenceExcerpt: "原文不存在", sectionId: "section-1", confidence: "high" }] });
  await assert.rejects(() => new LlmMaterialKnowledgeExtractor(new MaterialTestProvider([invalid, invalid]), 2).extract(extraction), /evidenceExcerpt 不是来源原文/);
});

test("v1.5.0 sanitized base-platform material completes register-extract-derive-compare", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-real-material-"));
  const sourceRoot = path.join(root, "sources");
  const service = new ProductSourceService();
  const source = await service.add(sourceRoot, path.resolve("test/fixtures/v1.5.0/base-platform-material.md"), { type: "product-design", sensitivity: "internal", product: "base-platform", version: "3.0.0" });
  const extraction = await service.extract(sourceRoot, source.id);
  const derivation = await deriveMaterialKnowledge(extraction.jsonPath);
  const comparison = compareMaterialCandidates(derivation.report, await new PlatformKnowledgeService().load(path.resolve("knowledge/platform")));
  assert.equal(extraction.report.status, "extracted");
  assert.ok(derivation.report.candidates.some((item) => item.kind === "capability"));
  assert.ok(derivation.report.candidates.some((item) => item.kind === "constraint"));
  assert.ok(derivation.report.candidates.every((item) => item.evidence.sourceId === source.id && item.evidence.excerpt.length > 0));
  assert.ok(comparison.comparisons.every((item) => item.requiresHumanConfirmation));
  assert.doesNotMatch(JSON.stringify({ extraction: extraction.report, derivation: derivation.report }), /summerjaney|LDP2\.0|五矿/);
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

test("v1.5.0 distinguishes a newer source version and a contradictory rule", async () => {
  const catalog = await new PlatformKnowledgeService().load(path.resolve("knowledge/platform"));
  const existing = catalog.byId.get("constraint.organization.code-unique")!;
  const candidate = (description: string, version: string): MaterialKnowledgeDerivation => ({ schemaVersion: "1.5", sourceId: "source.ldp", status: "pending-product-manager-review", generatedAt: "2026-08-17T00:00:00Z", candidates: [{
    id: existing.id, kind: existing.kind, status: "draft", confidence: "high", entity: { ...existing, description, status: "draft", source: { ...existing.source, version } }, evidence: { sourceId: "source.ldp", sectionId: "s1", sectionTitle: "规则", locator: { page: 28 }, excerpt: description, contentFingerprint: "sha256:evidence" },
  }] });
  assert.equal(compareMaterialCandidates(candidate("组织编码需要全局校验并记录冲突。", "4.0.0"), catalog).comparisons[0].decision, "new-version");
  assert.equal(compareMaterialCandidates(candidate("组织编码允许重复。", "3.0.0"), catalog).comparisons[0].decision, "conflict");
});

test("v1.5.0 requires a complete product-manager review before packaging", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-review-gate-"));
  const candidate = { id: "constraint.organization.new-rule", kind: "constraint" as const, status: "draft" as const, confidence: "high" as const,
    entity: { id: "constraint.organization.new-rule", kind: "constraint" as const, name: "组织新规则", description: "新增组织必须填写生效日期。", version: "1.0.0", status: "draft" as const, tags: ["组织"], source: { type: "product-design" as const, document: "平台设计说明书", version: "3.0.0" }, references: [], severity: "error" as const, rule: "新增组织必须填写生效日期。" },
    evidence: { sourceId: "source.ldp", sectionId: "s1", sectionTitle: "组织规则", locator: { page: 30 }, excerpt: "新增组织必须填写生效日期。", contentFingerprint: "sha256:evidence" } };
  const derivation = { schemaVersion: "1.5", sourceId: "source.ldp", status: "pending-product-manager-review", generatedAt: "2026-08-17T00:00:00Z", candidates: [candidate] };
  const comparison = { schemaVersion: "1.5", sourceId: "source.ldp", catalogVersion: "1.4.0", comparedAt: "2026-08-17T00:00:00Z", comparisons: [{ candidateId: candidate.id, decision: "new-knowledge", reasons: ["new"], requiresHumanConfirmation: true }] };
  const derivationPath = path.join(root, "candidates.json"); const comparisonPath = path.join(root, "comparison.json"); const reviewPath = path.join(root, "review.json");
  await writeFile(derivationPath, JSON.stringify(derivation)); await writeFile(comparisonPath, JSON.stringify(comparison));
  await writeFile(reviewPath, JSON.stringify({ schemaVersion: "1.5", sourceId: "source.ldp", catalogVersion: "1.4.0", reviewedBy: "product-manager", decisions: [{ candidateId: candidate.id, action: "pending" }] }));
  await assert.rejects(() => prepareMaterialPromotionPackage(derivationPath, comparisonPath, reviewPath), /reviewedAt|待审核/);
  await writeFile(reviewPath, JSON.stringify({ schemaVersion: "1.5", sourceId: "source.ldp", catalogVersion: "1.4.0", reviewedBy: "product-manager", reviewedAt: "2026-08-17T01:00:00Z", decisions: [{ candidateId: candidate.id, action: "accept-new" }] }));
  const output = await prepareMaterialPromotionPackage(derivationPath, comparisonPath, reviewPath);
  assert.equal(output.promotion.candidates.length, 1);
  assert.match(await readFile(output.markdownPath, "utf8"), /不会修改正式知识/);
});

test("v1.5.0 explicitly promotes an approved package through the shared v1.4.0 safety path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v150-promote-"));
  const knowledgeDirectory = path.join(root, "platform");
  await cp(path.resolve("knowledge/platform"), knowledgeDirectory, { recursive: true });
  const packagePath = path.join(root, "promotion-package.json");
  const entity = { id: "constraint.organization.effective-date-required", kind: "constraint", name: "组织生效日期必填", description: "新增组织必须填写生效日期。", version: "1.0.0", status: "draft", tags: ["组织"], source: { type: "product-design", document: "平台设计说明书", version: "3.0.0" }, references: [], severity: "error", rule: "新增组织必须填写生效日期。" };
  await writeFile(packagePath, JSON.stringify({ schemaVersion: "1.5", sourceId: "source.ldp", catalogVersion: "1.4.0", status: "approved-for-explicit-promotion", approvedAt: "2026-08-17T01:00:00Z", approvedBy: "product-manager", candidates: [{ id: entity.id, kind: entity.kind, status: "draft", confidence: "high", entity, evidence: { sourceId: "source.ldp", sectionId: "s1", sectionTitle: "组织", locator: { page: 30 }, excerpt: entity.description, contentFingerprint: "sha256:evidence" } }] }));
  const output = await promoteMaterialPackage(packagePath, knowledgeDirectory);
  assert.deepEqual(output.acceptedIds, [entity.id]);
  assert.equal((await new PlatformKnowledgeService().load(knowledgeDirectory)).byId.get(entity.id)?.status, "confirmed");
  assert.match(await readFile(output.snapshotPath, "utf8"), /"schemaVersion": "1.4"/);
  await assert.rejects(() => promoteMaterialPackage(packagePath, knowledgeDirectory), /禁止覆盖|版本已变化/);
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
