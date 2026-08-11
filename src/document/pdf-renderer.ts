import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { DocumentBlock, DocumentRenderRequest, DocumentRenderResult, DocumentRenderer } from "./types.js";

const require = createRequire(import.meta.url);
const FONT_REGULAR = require.resolve("@openfonts/noto-sans-sc_chinese-simplified/files/noto-sans-sc-chinese-simplified-400.woff");
const FONT_BOLD = require.resolve("@openfonts/noto-sans-sc_chinese-simplified/files/noto-sans-sc-chinese-simplified-700.woff");

function ensureSpace(document: PDFKit.PDFDocument, height: number): void {
  if (document.y + height > document.page.height - 64) document.addPage();
}

function renderTable(document: PDFKit.PDFDocument, block: Extract<DocumentBlock, { type: "table" }>): void {
  const columns = Math.max(1, block.headers.length);
  const width = (document.page.width - 96) / columns;
  const rows = [block.headers, ...block.rows];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const height = Math.max(30, ...block.headers.map((_, index) => document.heightOfString(row[index] ?? "", { width: width - 12, features: [] }) + 12));
    ensureSpace(document, height);
    const y = document.y;
    for (let index = 0; index < columns; index++) {
      const x = 48 + index * width;
      document.save().rect(x, y, width, height).fillAndStroke(rowIndex === 0 ? "#D9EAF7" : "#FFFFFF", "#AAB7C2").restore();
      document.font(rowIndex === 0 ? "PAE-Bold" : "PAE-Regular").fontSize(9).fillColor("#1D2A35").text(row[index] ?? "", x + 6, y + 6, { width: width - 12, height: height - 12, features: [] });
    }
    document.y = y + height;
  }
  document.moveDown(0.8);
}

function renderBlock(document: PDFKit.PDFDocument, block: DocumentBlock): void {
  if (block.type === "heading") {
    ensureSpace(document, 48);
    document.moveDown(0.6).font("PAE-Bold").fillColor("#163A5F").fontSize(Math.max(12, 22 - block.level * 2)).text(block.text, { features: [] }).moveDown(0.3);
  } else if (block.type === "paragraph") {
    document.font("PAE-Regular").fillColor("#1D2A35").fontSize(10.5).text(block.text, { lineGap: 4, features: [] }).moveDown(0.5);
  } else if (block.type === "list") {
    block.items.forEach((item, index) => document.font("PAE-Regular").fontSize(10.5).text(`${block.ordered ? `${index + 1}.` : "•"} ${item}`, { indent: 14, lineGap: 3, features: [] }));
    document.moveDown(0.5);
  } else if (block.type === "table") {
    renderTable(document, block);
  } else if (block.type === "code") {
    ensureSpace(document, 60);
    document.font("PAE-Regular").fontSize(8.5).fillColor("#334455").text(block.content, { indent: 12, lineGap: 2, features: [] }).moveDown(0.7);
  } else {
    document.font("PAE-Regular").fontSize(9).fillColor("#5B6B78").text(`[图片：${block.alt || path.basename(block.source)}，详见 DOCX 或原始成果物]`, { features: [] }).moveDown(0.5);
  }
}

export class PdfRenderer implements DocumentRenderer {
  readonly name = "pae-pdf";
  readonly format = "pdf" as const;

  async render(request: DocumentRenderRequest): Promise<DocumentRenderResult> {
    try {
      await mkdir(path.dirname(request.outputPath), { recursive: true });
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(request.outputPath);
        const document = new PDFDocument({ size: "A4", margins: { top: 56, right: 48, bottom: 56, left: 48 }, info: { Title: request.document.metadata.title, Author: "PAE" }, bufferPages: true });
        output.on("finish", resolve);
        output.on("error", reject);
        document.on("error", reject);
        document.pipe(output);
        document.registerFont("PAE-Regular", FONT_REGULAR);
        document.registerFont("PAE-Bold", FONT_BOLD);
        document.font("PAE-Bold").fillColor("#163A5F").fontSize(26).text(request.document.metadata.title, 72, 190, { align: "center", features: [] });
        document.moveDown(2).font("PAE-Regular").fillColor("#4F6578").fontSize(12).text(request.document.metadata.projectName ?? "", { align: "center", features: [] });
        document.moveDown(2).fontSize(10).text(`需求编号：${request.document.metadata.requirementId ?? "未提供"}`, { align: "center", features: [] });
        document.text(`产品版本：${request.document.metadata.productVersion ?? "未提供"}`, { align: "center", features: [] });
        document.text(`PAE 版本：${request.document.metadata.engineVersion}`, { align: "center", features: [] });
        document.text(`生成时间：${request.document.metadata.generatedAt.slice(0, 10)}`, { align: "center", features: [] });
        document.addPage();
        for (const source of request.document.sources) for (const block of source.blocks) renderBlock(document, block);
        const range = document.bufferedPageRange();
        for (let index = range.start; index < range.start + range.count; index++) {
          document.switchToPage(index);
          document.font("PAE-Regular").fontSize(8).fillColor("#6B7B88").text(`${request.document.metadata.title}  ·  第 ${index + 1} 页`, 48, document.page.height - 38, { width: document.page.width - 96, align: "center", features: [] });
        }
        document.end();
      });
      return { format: this.format, outputPath: request.outputPath, status: "GENERATED", renderer: this.name };
    } catch (error) {
      return { format: this.format, outputPath: request.outputPath, status: "FAILED", renderer: this.name, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
