import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { LoadedMasterGoConfig } from "./config.js";
import type { MasterGoConnection, MasterGoDoctorReport } from "./types.js";

export interface MasterGoDoctorOptions {
  now?: () => Date;
  path?: string;
  connectionFactory?: () => Promise<MasterGoConnection>;
}

async function commandExists(command: string, pathValue = process.env.PATH ?? ""): Promise<boolean> {
  const candidates = command.includes(path.sep)
    ? [path.resolve(command)]
    : pathValue.split(path.delimiter).filter(Boolean).map((directory) => path.join(directory, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return true;
    } catch {
      // Continue searching PATH.
    }
  }
  return false;
}

export async function diagnoseMasterGo(
  loaded: LoadedMasterGoConfig | undefined,
  options: MasterGoDoctorOptions = {},
): Promise<MasterGoDoctorReport> {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  if (!loaded) {
    return {
      schemaVersion: "0.1", status: "NOT_CONFIGURED", checkedAt,
      checks: [
        { id: "configuration", status: "FAIL", message: "未找到 MasterGo MCP 配置。" },
        { id: "command", status: "SKIPPED", message: "配置缺失，未检查启动命令。" },
        { id: "connection", status: "SKIPPED", message: "配置缺失，未探测连接。" },
      ],
      nextAction: "设置 PAE_MASTERGO_MCP_CONFIG，或设置 PAE_MASTERGO_MCP_COMMAND 与 PAE_MASTERGO_MCP_ARGS。",
    };
  }

  const checks: MasterGoDoctorReport["checks"] = [
    { id: "configuration", status: "PASS", message: `已加载配置：${loaded.source}` },
  ];
  if (!await commandExists(loaded.config.command, options.path)) {
    checks.push(
      { id: "command", status: "FAIL", message: `启动命令不可访问：${loaded.config.command}` },
      { id: "connection", status: "SKIPPED", message: "启动命令不可访问，未探测连接。" },
    );
    return {
      schemaVersion: "0.1", status: "COMMAND_NOT_FOUND", checkedAt,
      configSource: loaded.source, command: loaded.config.command, checks,
      nextAction: "检查 command 路径，或确保命令所在目录已加入 PATH。",
    };
  }
  checks.push({ id: "command", status: "PASS", message: `启动命令可访问：${loaded.config.command}` });

  if (!options.connectionFactory) {
    checks.push({ id: "connection", status: "SKIPPED", message: "配置与命令已就绪；本次未启用真实 MCP 探测。" });
    return {
      schemaVersion: "0.1", status: "READY", checkedAt,
      configSource: loaded.source, command: loaded.config.command, checks,
      nextAction: "连接执行器启用后运行真实 MCP initialize 探测。",
    };
  }

  let connection: MasterGoConnection | undefined;
  try {
    connection = await options.connectionFactory();
    const info = await connection.probe();
    checks.push({ id: "connection", status: "PASS", message: "MasterGo MCP initialize 探测成功。" });
    return {
      schemaVersion: "0.1", status: "READY", checkedAt,
      configSource: loaded.source, command: loaded.config.command, checks, connection: info,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    checks.push({ id: "connection", status: "FAIL", message: `MasterGo MCP 探测失败：${reason}` });
    return {
      schemaVersion: "0.1", status: "PROBE_FAILED", checkedAt,
      configSource: loaded.source, command: loaded.config.command, checks,
      nextAction: "确认 MasterGo 已启动、设计文件已打开且 MCP Server 已连接。",
    };
  } finally {
    await connection?.close().catch(() => undefined);
  }
}
