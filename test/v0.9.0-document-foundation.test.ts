import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDocumentDsl, prepareDocumentExport } from "../src/document/service.js";

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

test("TC-090-002: DOCX/PDF 共用文档模型并生成可追踪导出计划", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v090-export-"));
  await writeFile(path.join(root, "09-prd.md"), "# PRD\n\n正式交付内容。\n");
  const output = await prepareDocumentExport(root, ["docx", "pdf"]);
  assert.equal(output.manifest.status, "PLANNED");
  assert.deepEqual(output.manifest.requestedFormats, ["docx", "pdf"]);
  assert.equal(output.manifest.results.length, 2);
  assert.match(await readFile(output.documentModelPath, "utf8"), /\"schemaVersion\": \"0\.9\"/);
  assert.match(await readFile(output.manifestPath, "utf8"), /not-configured/);
});
