import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RequirementSourceIndex, RequirementSourceRecord, RequirementSourceSensitivity, RequirementSourceType } from "./types.js";

const SOURCE_DIRECTORY = "00-sources";
const INDEX_FILE = "source-index.json";

function mediaType(file: string): string {
  const extension = path.extname(file).toLowerCase();
  return ({ ".md": "text/markdown", ".txt": "text/plain", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as Record<string, string>)[extension] ?? "application/octet-stream";
}

function safeFileName(value: string): string {
  const name = path.basename(value).normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  if (!name || name === "." || name === "..") throw new Error("来源文件名无效。");
  return name;
}

async function loadIndex(requirementDirectory: string): Promise<RequirementSourceIndex> {
  try {
    const value = JSON.parse(await readFile(path.join(requirementDirectory, SOURCE_DIRECTORY, INDEX_FILE), "utf8")) as RequirementSourceIndex;
    if (value.schemaVersion !== "1.3" || !Array.isArray(value.sources)) throw new Error("来源索引格式无效。");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { schemaVersion: "1.3", updatedAt: new Date(0).toISOString(), sources: [] };
  }
}

export async function addRequirementSource(requirementDirectory: string, sourceFile: string, options: { label?: string; type: RequirementSourceType; sensitivity: RequirementSourceSensitivity; includeInAnalysis?: boolean }): Promise<{ source: RequirementSourceRecord; indexPath: string }> {
  const absoluteSource = path.resolve(sourceFile);
  const info = await stat(absoluteSource);
  if (!info.isFile()) throw new Error("需求来源必须是文件。");
  const content = await readFile(absoluteSource);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const index = await loadIndex(requirementDirectory);
  const duplicate = index.sources.find((item) => item.sha256 === sha256);
  if (duplicate) throw new Error(`需求来源已登记：${duplicate.id}（${duplicate.label}）。`);
  const originalName = safeFileName(sourceFile);
  const id = `SRC-${String(index.sources.length + 1).padStart(3, "0")}`;
  const storedName = `${id}-${originalName}`;
  const directory = path.join(requirementDirectory, SOURCE_DIRECTORY);
  await mkdir(directory, { recursive: true });
  await copyFile(absoluteSource, path.join(directory, storedName));
  const source: RequirementSourceRecord = {
    id, label: options.label?.trim() || path.basename(originalName, path.extname(originalName)),
    type: options.type, sensitivity: options.sensitivity,
    storedPath: `${SOURCE_DIRECTORY}/${storedName}`, originalName,
    mediaType: mediaType(originalName), size: info.size, sha256,
    includeInAnalysis: options.includeInAnalysis ?? true, addedAt: new Date().toISOString(),
  };
  index.sources.push(source);
  index.updatedAt = source.addedAt;
  const indexPath = path.join(directory, INDEX_FILE);
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await writeFile(path.join(directory, "source-index.md"), renderRequirementSourceIndex(index), "utf8");
  return { source, indexPath };
}

export async function readRequirementSourceIndex(requirementDirectory: string): Promise<RequirementSourceIndex> {
  return loadIndex(requirementDirectory);
}

export async function registerPrimaryRequirementSource(requirementDirectory: string, sourceName: string, content: string): Promise<void> {
  const sha256 = createHash("sha256").update(content).digest("hex");
  const index = await loadIndex(requirementDirectory);
  const existing = index.sources.find((item) => item.id === "SRC-000");
  const now = new Date().toISOString();
  const source: RequirementSourceRecord = {
    id: "SRC-000", label: "原始需求", type: "requirement", sensitivity: "internal",
    storedPath: "00-requirement-input.md", originalName: safeFileName(sourceName),
    mediaType: "text/markdown", size: Buffer.byteLength(content), sha256,
    includeInAnalysis: true, addedAt: existing?.addedAt ?? now,
  };
  index.sources = [source, ...index.sources.filter((item) => item.id !== source.id)];
  index.updatedAt = now;
  const directory = path.join(requirementDirectory, SOURCE_DIRECTORY);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`, "utf8"),
    writeFile(path.join(directory, "source-index.md"), renderRequirementSourceIndex(index), "utf8"),
  ]);
}

export function renderRequirementSourceIndex(index: RequirementSourceIndex): string {
  const rows = index.sources.length
    ? index.sources.map((item) => `| ${item.id} | ${item.label} | ${item.type} | ${item.sensitivity} | ${item.includeInAnalysis ? "是" : "否"} | ${item.sha256.slice(0, 12)} |`).join("\n")
    : "| — | 暂无来源 | — | — | — | — |";
  return `# 真实需求来源索引\n\n- 来源数量：${index.sources.length}\n- 纳入分析：${index.sources.filter((item) => item.includeInAnalysis).length}\n- 更新时间：${index.updatedAt}\n\n| ID | 名称 | 类型 | 敏感级别 | 纳入分析 | SHA-256 |\n|---|---|---|---|---|---|\n${rows}\n`;
}
