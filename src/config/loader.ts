import { readFile } from "node:fs/promises";
import path from "node:path";
import { PAE_CONFIG_SCHEMA_VERSION, type PaeConfig } from "./types.js";

const DEFAULT_PAE_CONFIG_VALUE: PaeConfig = {
  schemaVersion: PAE_CONFIG_SCHEMA_VERSION,
  llm: { provider: "mock" },
  knowledge: { mode: "auto" },
  extensions: { enabled: false, directories: [] },
  mastergo: { enabled: true, write: false },
  delivery: { formats: ["docx", "pdf"], qualityGate: "standard" },
  execution: { retries: 0, resume: false },
};

export const DEFAULT_PAE_CONFIG: Readonly<PaeConfig> = Object.freeze(DEFAULT_PAE_CONFIG_VALUE);

function assertConfig(value: unknown): asserts value is PaeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("pae.config.json 必须是 JSON 对象。");
  const config = value as Record<string, unknown>;
  if (config.schemaVersion !== PAE_CONFIG_SCHEMA_VERSION) throw new Error(`pae.config.json schemaVersion 必须为 ${PAE_CONFIG_SCHEMA_VERSION}。`);
  const execution = config.execution as Record<string, unknown> | undefined;
  if (execution?.retries !== undefined && (!Number.isInteger(execution.retries) || (execution.retries as number) < 0)) {
    throw new Error("pae.config.json execution.retries 必须是大于等于 0 的整数。");
  }
  const extensions = config.extensions as Record<string, unknown> | undefined;
  if (extensions?.workspace !== undefined && (typeof extensions.workspace !== "string" || !extensions.workspace.trim())) {
    throw new Error("pae.config.json extensions.workspace 必须是非空路径字符串。");
  }
  if (extensions?.directories !== undefined && (!Array.isArray(extensions.directories) || extensions.directories.some((item) => typeof item !== "string" || !item.trim()))) {
    throw new Error("pae.config.json extensions.directories 必须是非空路径字符串数组。");
  }
}

export async function loadPaeConfig(directory = process.cwd()): Promise<{ config: PaeConfig; path?: string }> {
  const configPath = path.resolve(directory, "pae.config.json");
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { config: structuredClone(DEFAULT_PAE_CONFIG) };
    throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`pae.config.json 不是有效 JSON：${configPath}`); }
  assertConfig(parsed);
  return { config: parsed, path: configPath };
}
