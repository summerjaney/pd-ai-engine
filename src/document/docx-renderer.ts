import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DocumentBlock, DocumentRenderRequest, DocumentRenderResult, DocumentRenderer } from "./types.js";

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6] as const;

function textParagraph(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, size: 21, font: "Microsoft YaHei" })], spacing: { after: 120, line: 360 } });
}

function tableCell(text: string, header = false): TableCell {
  return new TableCell({
    shading: header ? { type: ShadingType.CLEAR, fill: "D9EAF7" } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: header, size: 19, font: "Microsoft YaHei" })] })],
  });
}

async function imageBlock(block: Extract<DocumentBlock, { type: "image" }>, sourceDirectory: string): Promise<Paragraph> {
  const imagePath = path.resolve(sourceDirectory, block.source);
  const data = await readFile(imagePath);
  const extension = path.extname(imagePath).toLowerCase();
  const type = extension === ".png" ? "png" : extension === ".jpg" || extension === ".jpeg" ? "jpg" : undefined;
  if (!type) return textParagraph(`[图片：${block.alt || path.basename(block.source)}，暂不支持 ${extension || "未知"} 格式]`);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ type, data, transformation: { width: 560, height: 315 }, altText: { title: block.alt || "图片", description: block.alt || "图片", name: block.alt || "image" } })],
    spacing: { before: 120, after: 120 },
  });
}

async function renderBlock(block: DocumentBlock, sourceDirectory: string): Promise<Paragraph | Table> {
  if (block.type === "heading") {
    return new Paragraph({ text: block.text, heading: HEADING_LEVELS[Math.min(Math.max(block.level, 1), 6) - 1], spacing: { before: 240, after: 120 } });
  }
  if (block.type === "paragraph") return textParagraph(block.text);
  if (block.type === "code") {
    return new Paragraph({
      children: [new TextRun({ text: block.content, font: "Consolas", size: 18 })],
      shading: { type: ShadingType.CLEAR, fill: "F4F6F8" },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: "7A8B99" } },
      indent: { left: 240 }, spacing: { before: 100, after: 160 },
    });
  }
  if (block.type === "list") {
    return new Paragraph({
      children: block.items.flatMap((item, index) => [new TextRun({ text: `${block.ordered ? `${index + 1}.` : "•"} ${item}`, size: 21, font: "Microsoft YaHei" }), new TextRun({ break: 1 })]),
      indent: { left: 360 }, spacing: { after: 120, line: 360 },
    });
  }
  if (block.type === "table") {
    const columnCount = Math.max(1, block.headers.length);
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: Array.from({ length: columnCount }, () => Math.floor(9000 / columnCount)),
      rows: [new TableRow({ tableHeader: true, children: block.headers.map((cell) => tableCell(cell, true)) }), ...block.rows.map((row) => new TableRow({ children: block.headers.map((_, index) => tableCell(row[index] ?? "")) }))],
    });
  }
  return imageBlock(block, sourceDirectory);
}

export class DocxRenderer implements DocumentRenderer {
  readonly name = "pae-docx";
  readonly format = "docx" as const;

  async render(request: DocumentRenderRequest): Promise<DocumentRenderResult> {
    try {
      const children: Array<Paragraph | Table | TableOfContents> = [
        new Paragraph({ text: request.document.metadata.title, alignment: AlignmentType.CENTER, spacing: { before: 2200, after: 500 }, style: "Title" }),
        new Paragraph({ text: request.document.metadata.projectName ?? "", alignment: AlignmentType.CENTER, style: "Subtitle" }),
        textParagraph(`需求编号：${request.document.metadata.requirementId ?? "未提供"}`),
        textParagraph(`产品版本：${request.document.metadata.productVersion ?? "未提供"}`),
        textParagraph(`PAE 版本：${request.document.metadata.engineVersion}`),
        textParagraph(`生成时间：${request.document.metadata.generatedAt.slice(0, 10)}`),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: "目录", heading: HeadingLevel.HEADING_1 }),
        new TableOfContents("目录", { hyperlink: true, headingStyleRange: "1-6" }),
        new Paragraph({ children: [new PageBreak()] }),
      ];
      for (const source of request.document.sources) {
        const sourceDirectory = path.dirname(path.resolve(path.dirname(request.outputPath), "..", "..", source.sourcePath));
        for (const block of source.blocks) children.push(await renderBlock(block, sourceDirectory));
      }
      const document = new Document({
        creator: "PAE",
        title: request.document.metadata.title,
        description: "PAE 正式产品设计交付文档",
        styles: {
          default: { document: { run: { font: "Microsoft YaHei", size: 21 }, paragraph: { spacing: { line: 360 } } } },
          paragraphStyles: [
            { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 44, bold: true, color: "163A5F", font: "Microsoft YaHei" }, paragraph: { alignment: AlignmentType.CENTER } },
            { id: "Subtitle", name: "Subtitle", basedOn: "Normal", next: "Normal", run: { size: 28, color: "4F6578", font: "Microsoft YaHei" }, paragraph: { alignment: AlignmentType.CENTER } },
          ],
        },
        numbering: { config: [] },
        sections: [{
          properties: { page: { margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 } } },
          headers: { default: new Header({ children: [new Paragraph({ text: request.document.metadata.title, alignment: AlignmentType.RIGHT })] }) },
          footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("第 "), new TextRun({ children: [PageNumber.CURRENT] }), new TextRun(" 页") ] })] }) },
          children,
        }],
      });
      await writeFile(request.outputPath, await Packer.toBuffer(document));
      return { format: this.format, outputPath: request.outputPath, status: "GENERATED", renderer: this.name };
    } catch (error) {
      return { format: this.format, outputPath: request.outputPath, status: "FAILED", renderer: this.name, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
