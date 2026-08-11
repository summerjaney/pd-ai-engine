import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readEngineVersion } from "../version.js";
import type { DocumentBlock, DocumentDsl, DocumentExportManifest, DocumentFormat, DocumentRenderer, DocumentSource } from "./types.js";

const SOURCES = [
  ["requirement-analysis", "01-requirement-analysis.md"],
  ["product-outline", "02-product-outline.md"],
  ["product-architecture", "03-product-architecture.md"],
  ["core-flow", "04-core-flow.md"],
  ["page-structure", "05-page-structure.md"],
  ["prd", "09-prd.md"],
  ["product-manual", "10-product-manual/product-manual.md"],
  ["operation-manual", "11-operation-manual/operation-manual.md"],
] as const;

function markdownBlocks(content: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let code: string[] | undefined;
  let language: string | undefined;
  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  for (const line of lines) {
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      if (code) {
        blocks.push({ type: "code", language, content: code.join("\n") });
        code = undefined;
        language = undefined;
      } else {
        flushParagraph();
        code = [];
        language = fence[1].trim() || undefined;
      }
      continue;
    }
    if (code) { code.push(line); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      blocks.push({ type: "image", alt: image[1], source: image[2] });
      continue;
    }
    if (!line.trim()) flushParagraph();
    else paragraph.push(line.trim());
  }
  flushParagraph();
  if (code) blocks.push({ type: "code", language, content: code.join("\n") });
  return blocks;
}

async function optionalJson<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function buildDocumentDsl(requirementDirectory: string): Promise<DocumentDsl> {
  const root = path.resolve(requirementDirectory);
  const metadata = await optionalJson<{ projectName?: string; productVersion?: string; requirementId?: string; revision?: number }>(path.join(root, "requirement.json"));
  const sources: DocumentSource[] = [];
  for (const [id, relativePath] of SOURCES) {
    try {
      const content = await readFile(path.join(root, relativePath), "utf8");
      const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? id;
      sources.push({ id, title, sourcePath: relativePath, blocks: markdownBlocks(content) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!sources.length) throw new Error("未找到可导出的 Markdown 成果物。");
  return {
    schemaVersion: "0.9",
    metadata: {
      title: `${metadata?.projectName ?? sources[0].title}产品设计交付文档`,
      projectName: metadata?.projectName,
      productVersion: metadata?.productVersion,
      requirementId: metadata?.requirementId,
      requirementRevision: metadata?.revision,
      engineVersion: await readEngineVersion(),
      generatedAt: new Date().toISOString(),
    },
    template: { id: "pae-standard", locale: "zh-CN", cover: true, tableOfContents: true, numberedHeadings: true, headerFooter: true },
    sources,
  };
}

export async function prepareDocumentExport(requirementDirectory: string, formats: DocumentFormat[], renderers: DocumentRenderer[] = []): Promise<{ manifest: DocumentExportManifest; manifestPath: string; documentModelPath: string }> {
  const root = path.resolve(requirementDirectory);
  const directory = path.join(root, "12-delivery", "documents");
  await mkdir(directory, { recursive: true });
  const document = await buildDocumentDsl(root);
  const documentModelPath = path.join(directory, "document-model.json");
  await writeFile(documentModelPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  const results = [];
  for (const format of formats) {
    const outputPath = path.join(directory, `product-design.${format}`);
    const renderer = renderers.find((item) => item.format === format);
    results.push(renderer
      ? await renderer.render({ format, document, outputPath })
      : { format, outputPath, status: "PLANNED" as const, renderer: "not-configured", message: `${format.toUpperCase()} 渲染器将在后续批次接入。` });
  }
  const statuses = new Set(results.map((item) => item.status));
  const status = statuses.size === 1 ? (results[0]?.status ?? "FAILED") : "PARTIAL";
  const manifest: DocumentExportManifest = {
    schemaVersion: "0.9", requirementId: document.metadata.requirementId, generatedAt: new Date().toISOString(),
    documentModelPath: path.relative(root, documentModelPath), requestedFormats: formats, results, status,
  };
  const manifestPath = path.join(directory, "document-export-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifestPath, documentModelPath };
}
