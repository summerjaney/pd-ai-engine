import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformKnowledgeCatalogFile, PlatformKnowledgeEntity } from "./types.js";
import { PlatformKnowledgeService } from "./service.js";
import { PlatformKnowledgeValidator } from "./validator.js";

export interface PlatformKnowledgePromotionResult {
  accepted: PlatformKnowledgeEntity[];
  catalogPath: string;
  snapshotPath: string;
}

export async function promotePlatformKnowledgeEntities(
  knowledgeDirectory: string,
  entities: PlatformKnowledgeEntity[],
  options: { expectedCatalogVersion: string; acceptedBy: string; now?: string },
): Promise<PlatformKnowledgePromotionResult> {
  if (!entities.length) throw new Error("没有可晋升的平台知识候选。");
  const service = new PlatformKnowledgeService();
  const catalog = await service.load(knowledgeDirectory);
  if (catalog.version !== options.expectedCatalogVersion) throw new Error("正式知识目录版本已变化，必须重新比较并审核候选。");
  const ids = entities.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("待晋升候选包含重复 ID。");
  if (ids.some((id) => catalog.byId.has(id))) throw new Error("候选知识 ID 已存在，禁止覆盖正式知识。");
  const now = options.now ?? new Date().toISOString();
  const accepted = entities.map((item): PlatformKnowledgeEntity => ({ ...item, status: "confirmed", source: { ...item.source, confirmedBy: options.acceptedBy, confirmedAt: now } } as PlatformKnowledgeEntity));
  const validator: PlatformKnowledgeValidator = new PlatformKnowledgeValidator();
  validator.validateEntities([...catalog.entities, ...accepted]);

  const catalogPath = path.join(knowledgeDirectory, "catalog.json");
  const rawCatalog = JSON.parse(await readFile(catalogPath, "utf8")) as PlatformKnowledgeCatalogFile;
  const historyDirectory = path.join(knowledgeDirectory, "history");
  await mkdir(historyDirectory, { recursive: true });
  const snapshotPath = path.join(historyDirectory, `catalog-${now.replace(/[:.]/g, "-")}.json`);
  await cp(catalogPath, snapshotPath, { errorOnExist: true });
  const entries: string[] = [];
  for (const entity of accepted) {
    const directory = entity.kind === "capability" ? "capabilities" : `${entity.kind}s`;
    const relative = `${directory}/${entity.id.replace(/[^a-z0-9.-]+/gi, "-")}.json`;
    await mkdir(path.join(knowledgeDirectory, directory), { recursive: true });
    await writeFile(path.join(knowledgeDirectory, relative), `${JSON.stringify(entity, null, 2)}\n`, "utf8");
    entries.push(relative);
  }
  const nextCatalog: PlatformKnowledgeCatalogFile = { ...rawCatalog, entries: [...rawCatalog.entries, ...entries] };
  validator.validateCatalog(nextCatalog);
  await writeFile(catalogPath, `${JSON.stringify(nextCatalog, null, 2)}\n`, "utf8");
  return { accepted, catalogPath, snapshotPath };
}
