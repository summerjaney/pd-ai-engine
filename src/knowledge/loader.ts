import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KnowledgeCatalog, KnowledgeCatalogFile, KnowledgeEntity } from "./types.js";
import { KnowledgeValidator } from "./validator.js";

const DEFAULT_KNOWLEDGE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../knowledge");

export class KnowledgeLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KnowledgeLoadError";
  }
}

export class KnowledgeLoader {
  constructor(private readonly validator: KnowledgeValidator = new KnowledgeValidator()) {}

  async load(directory = DEFAULT_KNOWLEDGE_DIRECTORY): Promise<KnowledgeCatalog> {
    const catalogPath = path.join(directory, "catalog.json");
    const catalog = await this.readJson(catalogPath);
    this.validator.validateCatalogFile(catalog);

    const entities: unknown[] = [];
    for (const entry of (catalog as KnowledgeCatalogFile).entries) {
      const entryPath = path.resolve(directory, entry);
      if (path.relative(directory, entryPath).startsWith("..")) {
        throw new KnowledgeLoadError(`知识文件路径越界：${entry}`);
      }
      entities.push(await this.readJson(entryPath));
    }
    this.validator.validateEntities(entities);
    const typedEntities = entities as KnowledgeEntity[];
    return {
      schemaVersion: "0.5",
      version: (catalog as KnowledgeCatalogFile).version,
      entities: typedEntities,
      byId: new Map(typedEntities.map((entity) => [entity.id, entity])),
    };
  }

  private async readJson(filePath: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      throw new KnowledgeLoadError(`无法读取知识文件：${filePath}`, { cause: error });
    }
  }
}
