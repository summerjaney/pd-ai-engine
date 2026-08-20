import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MARKET_EVIDENCE_SENSITIVITIES, MARKET_EVIDENCE_TYPES, type MarketEvidence, type MarketEvidenceCatalog, type MarketEvidenceInput } from "./types.js";

const CATALOG = "market-evidence-catalog.json";
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());

function assertLocator(value: unknown): asserts value is MarketEvidenceInput["locator"] {
  if (!isObject(value)) throw new Error("市场证据 locator 必须是对象。");
  if (![value.url, value.section, value.recordId].some(nonEmpty) && !(Number.isInteger(value.page) && Number(value.page) > 0)) {
    throw new Error("市场证据必须提供 locator.url、locator.section、locator.page 或 locator.recordId 之一。");
  }
  if (value.url !== undefined && !nonEmpty(value.url)) throw new Error("市场证据 locator.url 必须为非空字符串。");
  if (value.section !== undefined && !nonEmpty(value.section)) throw new Error("市场证据 locator.section 必须为非空字符串。");
  if (value.recordId !== undefined && !nonEmpty(value.recordId)) throw new Error("市场证据 locator.recordId 必须为非空字符串。");
  if (value.page !== undefined && (!Number.isInteger(value.page) || Number(value.page) <= 0)) throw new Error("市场证据 locator.page 必须为正整数。");
}

export function assertMarketEvidenceInput(value: unknown): asserts value is MarketEvidenceInput {
  if (!isObject(value)) throw new Error("市场证据必须是 JSON 对象。");
  for (const field of ["id", "name", "source", "collectedAt", "summary"] as const) if (!nonEmpty(value[field])) throw new Error(`市场证据缺少有效字段：${field}`);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(String(value.id))) throw new Error("市场证据 id 必须由小写字母、数字、点或连字符组成。");
  if (!MARKET_EVIDENCE_TYPES.includes(value.type as MarketEvidenceInput["type"])) throw new Error(`市场证据 type 非法：${String(value.type)}`);
  if (!MARKET_EVIDENCE_SENSITIVITIES.includes(value.sensitivity as MarketEvidenceInput["sensitivity"])) throw new Error(`市场证据 sensitivity 非法：${String(value.sensitivity)}`);
  if (Number.isNaN(Date.parse(String(value.collectedAt)))) throw new Error("市场证据 collectedAt 必须是有效日期时间。");
  assertLocator(value.locator);
}

function fingerprint(input: MarketEvidenceInput): string {
  return hash(JSON.stringify({ id: input.id, name: input.name, type: input.type, source: input.source, collectedAt: input.collectedAt, sensitivity: input.sensitivity, summary: input.summary, locator: input.locator }));
}

export class MarketEvidenceService {
  async load(directory: string): Promise<MarketEvidenceCatalog> {
    const catalogPath = path.join(directory, CATALOG);
    try {
      const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as MarketEvidenceCatalog;
      if (catalog.schemaVersion !== "1.9" || !Array.isArray(catalog.evidence)) throw new Error("市场证据目录结构无效。");
      for (const item of catalog.evidence) {
        assertMarketEvidenceInput(item);
        if (!nonEmpty(item.contentFingerprint) || !nonEmpty(item.registeredAt) || typeof item.excludeFromPublicDelivery !== "boolean") throw new Error(`市场证据结构无效：${item.id}`);
        if (fingerprint(item) !== item.contentFingerprint) throw new Error(`市场证据内容指纹不一致：${item.id}`);
      }
      const ids = new Set<string>();
      for (const item of catalog.evidence) { if (ids.has(item.id)) throw new Error(`市场证据 ID 重复：${item.id}`); ids.add(item.id); }
      return catalog;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: "1.9", evidence: [] };
      throw error;
    }
  }

  async add(directory: string, inputPath: string): Promise<{ evidence: MarketEvidence; path: string }> {
    const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
    assertMarketEvidenceInput(input);
    const catalog = await this.load(directory);
    if (catalog.evidence.some((item) => item.id === input.id)) throw new Error(`市场证据 ID 已存在：${input.id}`);
    const evidence: MarketEvidence = { ...input, schemaVersion: "1.9", contentFingerprint: fingerprint(input), registeredAt: new Date().toISOString(), excludeFromPublicDelivery: input.sensitivity !== "public" };
    catalog.evidence.push(evidence);
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, CATALOG);
    await writeFile(target, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    return { evidence, path: target };
  }

  async exportPublic(directory: string, outputPath: string): Promise<string> {
    const catalog = await this.load(directory);
    const publicEvidence = catalog.evidence.filter((item) => !item.excludeFromPublicDelivery).map(({ source, ...item }) => ({ ...item, source }));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({ schemaVersion: "1.9", evidence: publicEvidence }, null, 2)}\n`, "utf8");
    return outputPath;
  }
}
