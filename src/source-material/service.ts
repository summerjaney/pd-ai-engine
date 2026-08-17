import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import type { ExtractedSection, ProductSourceCatalog, ProductSourceExtraction, ProductSourceRecord, ProductSourceSensitivity, ProductSourceType } from "./types.js";

const CATALOG = "source-catalog.json";

function slug(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64) || "source";
}

function sha256(content: Buffer | string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function formatOf(file: string): ProductSourceRecord["format"] {
  const ext = path.extname(file).toLowerCase().slice(1);
  if (["md", "txt", "json", "docx", "pptx"].includes(ext)) return ext as ProductSourceRecord["format"];
  if (ext === "rp") return "axure-rp";
  return "other";
}

function decodeXml(value: string): string {
  return value.replace(/<w:tab\s*\/>|<a:br\s*\/>/g, "\t").replace(/<\/w:p>|<\/a:p>/g, "\n")
    .replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sectionsFromText(content: string): ExtractedSection[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sections: ExtractedSection[] = [];
  let title = "正文";
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) sections.push({ id: `section-${sections.length + 1}`, title, content: text, locator: { section: title } });
    buffer = [];
  };
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
    if (heading) { flush(); title = heading; }
    else buffer.push(line);
  }
  flush();
  if (!sections.length && content.trim()) sections.push({ id: "section-1", title: "正文", content: content.trim(), locator: { section: "正文" } });
  return sections;
}

export class ProductSourceService {
  async loadCatalog(root: string): Promise<ProductSourceCatalog> {
    try {
      const parsed = JSON.parse(await readFile(path.join(root, CATALOG), "utf8")) as ProductSourceCatalog;
      if (parsed.schemaVersion !== "1.5" || !Array.isArray(parsed.sources)) throw new Error("产品资料目录结构无效。");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: "1.5", sources: [] };
      throw error;
    }
  }

  async add(root: string, sourceFile: string, options: { type: ProductSourceType; sensitivity: ProductSourceSensitivity; product: string; name?: string; version?: string }): Promise<ProductSourceRecord> {
    const bytes = await readFile(sourceFile);
    const catalog = await this.loadCatalog(root);
    const base = slug(options.name ?? path.basename(sourceFile, path.extname(sourceFile)));
    const id = `source.${base}`;
    if (catalog.sources.some((item) => item.id === id)) throw new Error(`产品资料 ID 已存在：${id}`);
    const storedName = `${base}-${sha256(bytes).slice(7, 19)}${path.extname(sourceFile).toLowerCase()}`;
    await mkdir(path.join(root, "originals"), { recursive: true });
    await copyFile(sourceFile, path.join(root, "originals", storedName));
    const record: ProductSourceRecord = {
      id, name: options.name ?? path.basename(sourceFile, path.extname(sourceFile)), type: options.type, format: formatOf(sourceFile),
      product: options.product, version: options.version, sensitivity: options.sensitivity, originalFileName: path.basename(sourceFile),
      storedPath: `originals/${storedName}`, contentFingerprint: sha256(bytes), registeredAt: new Date().toISOString(),
      excludeFromPublicFixture: options.sensitivity !== "public",
    };
    catalog.sources.push(record);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, CATALOG), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    return record;
  }

  async extract(root: string, sourceId: string): Promise<{ report: ProductSourceExtraction; jsonPath: string; markdownPath: string }> {
    const catalog = await this.loadCatalog(root);
    const source = catalog.sources.find((item) => item.id === sourceId);
    if (!source) throw new Error(`未找到产品资料：${sourceId}`);
    const sourcePath = path.resolve(root, source.storedPath);
    if (path.relative(root, sourcePath).startsWith("..")) throw new Error("产品资料路径越界。");
    const warnings: string[] = [];
    let sections: ExtractedSection[] = [];
    let status: ProductSourceExtraction["status"] = "extracted";
    if (["md", "txt"].includes(source.format)) sections = sectionsFromText(await readFile(sourcePath, "utf8"));
    else if (source.format === "json") sections = sectionsFromText(JSON.stringify(JSON.parse(await readFile(sourcePath, "utf8")), null, 2));
    else if (source.format === "docx" || source.format === "pptx") {
      const zip = new AdmZip(sourcePath);
      const entries = zip.getEntries().filter((entry) => source.format === "docx"
        ? entry.entryName === "word/document.xml" || /^word\/(header|footer)\d+\.xml$/.test(entry.entryName)
        : /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName));
      sections = entries.map((entry, index) => {
        const content = decodeXml(entry.getData().toString("utf8"));
        const firstLine = content.split("\n").find(Boolean) ?? `第${index + 1}页`;
        return { id: `section-${index + 1}`, title: firstLine.slice(0, 80), content, locator: { page: index + 1, entry: entry.entryName } };
      }).filter((item) => item.content.length > 0);
      if (!sections.length) warnings.push("文件中未提取到可用正文，可能包含扫描图片或不受支持的嵌入内容。");
    } else if (source.format === "axure-rp") {
      status = "manual-input-required";
      warnings.push("Axure RP 专有文件暂不进行不可靠推断；请提供 Axure HTML 导出包或人工转录页面索引。 ");
    } else {
      status = "manual-input-required";
      warnings.push(`暂不支持 ${source.format} 自动解析。`);
    }
    const report: ProductSourceExtraction = { schemaVersion: "1.5", source, extractedAt: new Date().toISOString(), status, sections, warnings };
    const output = path.join(root, "extracted", source.id);
    await mkdir(output, { recursive: true });
    const jsonPath = path.join(output, "extraction.json");
    const markdownPath = path.join(output, "extraction.md");
    const markdown = [`# ${source.name} 资料解析`, "", `- 状态：${status}`, `- 来源：${source.id}`, `- 指纹：${source.contentFingerprint}`, "",
      ...warnings.map((item) => `> ${item}\n`), ...sections.flatMap((item) => [`## ${item.title}`, "", item.content, ""])].join("\n");
    await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, `${markdown.trim()}\n`, "utf8")]);
    return { report, jsonPath, markdownPath };
  }
}
