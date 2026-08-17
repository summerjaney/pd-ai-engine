import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformKnowledgeCatalog, PlatformKnowledgeCatalogFile, PlatformKnowledgeEntity } from "./types.js";
import { PlatformKnowledgeValidator } from "./validator.js";

export class PlatformKnowledgeLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "PlatformKnowledgeLoadError"; }
}

export class PlatformKnowledgeService {
  constructor(private readonly validator: PlatformKnowledgeValidator = new PlatformKnowledgeValidator()) {}

  async load(directory = path.resolve("knowledge/platform")): Promise<PlatformKnowledgeCatalog> {
    const rawCatalog = await this.readJson(path.join(directory, "catalog.json"));
    this.validator.validateCatalog(rawCatalog);
    const entities: unknown[] = [];
    for (const entry of rawCatalog.entries) {
      const entryPath = path.resolve(directory, entry);
      if (path.relative(directory, entryPath).startsWith("..")) throw new PlatformKnowledgeLoadError(`平台知识文件路径越界：${entry}`);
      entities.push(await this.readJson(entryPath));
    }
    this.validator.validateEntities(entities);
    const typed = entities as PlatformKnowledgeEntity[];
    return { schemaVersion: "1.4", version: rawCatalog.version, product: rawCatalog.product, entities: typed, byId: new Map(typed.map((item) => [item.id, item])) };
  }

  list(catalog: PlatformKnowledgeCatalog, confirmedOnly = false): PlatformKnowledgeEntity[] {
    return catalog.entities.filter((item) => !confirmedOnly || item.status === "confirmed");
  }

  search(catalog: PlatformKnowledgeCatalog, query: string, confirmedOnly = true): PlatformKnowledgeEntity[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.list(catalog, confirmedOnly).filter((item) => {
      const text = [item.id, item.name, item.description, ...item.tags].join(" ").toLowerCase();
      return keywords.every((keyword) => text.includes(keyword));
    });
  }

  private async readJson(filePath: string): Promise<unknown> {
    try { return JSON.parse(await readFile(filePath, "utf8")); }
    catch (error) { throw new PlatformKnowledgeLoadError(`无法读取平台知识文件：${filePath}`, { cause: error }); }
  }
}
