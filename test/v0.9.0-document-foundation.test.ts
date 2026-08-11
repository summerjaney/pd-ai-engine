import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDocumentDsl, prepareDocumentExport } from "../src/document/service.js";
import { buildFormalDelivery } from "../src/delivery/formal-package.js";

test("TC-090-001: Markdown 成果物统一转换为 Document DSL", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v090-document-"));
  await writeFile(path.join(root, "requirement.json"), JSON.stringify({ projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-090", revision: 2 }));
  await writeFile(path.join(root, "01-requirement-analysis.md"), "# 组织结构管理\n\n## 背景\n\n维护组织层级。\n\n```mermaid\nflowchart TD\nA-->B\n```\n");
  const dsl = await buildDocumentDsl(root);
  assert.equal(dsl.schemaVersion, "0.9");
  assert.equal(dsl.metadata.requirementId, "REQ-090");
  assert.equal(dsl.metadata.requirementRevision, 2);
  assert.equal(dsl.template.id, "pae-standard");
  assert.ok(dsl.sources[0].blocks.some((block) => block.type === "code" && block.language === "mermaid"));
});

test("TC-090-002: DOCX/PDF 共用文档模型并生成可追踪导出结果", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v090-export-"));
  await writeFile(path.join(root, "09-prd.md"), "# PRD\n\n正式交付内容。\n");
  const output = await prepareDocumentExport(root, ["docx", "pdf"]);
  assert.equal(output.manifest.status, "GENERATED");
  assert.deepEqual(output.manifest.requestedFormats, ["docx", "pdf"]);
  assert.equal(output.manifest.results.length, 2);
  assert.match(await readFile(output.documentModelPath, "utf8"), /\"schemaVersion\": \"0\.9\"/);
  assert.equal(output.manifest.results[0].status, "GENERATED");
  assert.equal(output.manifest.results[1].status, "GENERATED");
  assert.match(await readFile(output.manifestPath, "utf8"), /pae-docx/);
});

test("TC-090-005: PDF 使用嵌入式中文字体生成有效文件", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v090-pdf-"));
  await writeFile(path.join(root, "09-prd.md"), "# 组织管理 PRD\n\n支持新增、编辑和移动组织。\n");
  const output = await prepareDocumentExport(root, ["pdf"]);
  const file = output.manifest.results[0].outputPath;
  assert.equal((await readFile(file)).subarray(0, 5).toString(), "%PDF-");
  assert.ok((await stat(file)).size > 10_000);
});

test("TC-090-006: 正式交付构建会生成双格式文档与 ZIP", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v090-package-"));
  await writeFile(path.join(root, "09-prd.md"), "# PRD\n\n正式交付。\n");
  const output = await buildFormalDelivery(root);
  assert.equal((await readFile(output.zipPath)).subarray(0, 2).toString(), "PK");
  assert.ok((await stat(path.join(output.directory, "documents", "product-design.docx"))).size > 5_000);
  assert.ok((await stat(path.join(output.directory, "documents", "product-design.pdf"))).size > 10_000);
});

test("TC-090-003: 标准 DOCX 包含封面、目录、标题、列表与表格", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v090-docx-"));
  await writeFile(path.join(root, "requirement.json"), JSON.stringify({ projectName: "基础平台", productVersion: "3.0.0", requirementId: "REQ-090" }));
  await writeFile(path.join(root, "09-prd.md"), "# 组织管理 PRD\n\n## 功能列表\n\n- 新增组织\n- 编辑组织\n\n| 字段 | 必填 |\n|---|---|\n| 组织名称 | 是 |\n");
  const output = await prepareDocumentExport(root, ["docx"]);
  const file = output.manifest.results[0].outputPath;
  const buffer = await readFile(file);
  assert.equal(output.manifest.status, "GENERATED");
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.ok((await stat(file)).size > 5_000);
});

test("TC-090-004: DOCX 可嵌入本地 PNG 图片", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v090-image-"));
  await mkdir(path.join(root, "assets"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await writeFile(path.join(root, "assets", "page.png"), png);
  await writeFile(path.join(root, "09-prd.md"), "# PRD\n\n![页面预览](assets/page.png)\n");
  const output = await prepareDocumentExport(root, ["docx"]);
  assert.equal(output.manifest.status, "GENERATED");
  assert.ok((await stat(output.manifest.results[0].outputPath)).size > 5_000);
});
