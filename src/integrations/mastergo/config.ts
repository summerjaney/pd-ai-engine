import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MasterGoMcpConfig } from "./types.js";

export interface LoadedMasterGoConfig {
  config: MasterGoMcpConfig;
  source: string;
}

function validateConfig(value: unknown, source: string): MasterGoMcpConfig {
  if (!value || typeof value !== "object") throw new Error(`MasterGo MCP 配置无效：${source}`);
  const candidate = value as Partial<MasterGoMcpConfig>;
  if (typeof candidate.command !== "string" || !candidate.command.trim()) {
    throw new Error(`MasterGo MCP 配置缺少 command：${source}`);
  }
  if (candidate.args !== undefined && (!Array.isArray(candidate.args) || candidate.args.some((item) => typeof item !== "string"))) {
    throw new Error(`MasterGo MCP 配置的 args 必须是字符串数组：${source}`);
  }
  return { command: candidate.command, args: candidate.args ?? [], env: candidate.env };
}

export async function loadMasterGoMcpConfig(
  environment: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<LoadedMasterGoConfig | undefined> {
  const configPath = environment.PAE_MASTERGO_MCP_CONFIG;
  if (configPath) {
    const resolved = path.resolve(cwd, configPath);
    const parsed = JSON.parse(await readFile(resolved, "utf8")) as unknown;
    const nested = (parsed as { mcpServers?: { mastergo?: unknown } })?.mcpServers?.mastergo;
    return { config: validateConfig(nested ?? parsed, resolved), source: resolved };
  }

  const command = environment.PAE_MASTERGO_MCP_COMMAND;
  if (!command) return undefined;
  let args: string[] = [];
  if (environment.PAE_MASTERGO_MCP_ARGS) {
    const parsed = JSON.parse(environment.PAE_MASTERGO_MCP_ARGS) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("PAE_MASTERGO_MCP_ARGS 必须是 JSON 字符串数组。");
    }
    args = parsed;
  }
  return { config: { command, args }, source: "environment" };
}
