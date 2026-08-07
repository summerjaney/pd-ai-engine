import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type { MasterGoConnection, MasterGoConnectionInfo, MasterGoMcpConfig } from "./types.js";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: {
    serverInfo?: { name?: string; version?: string };
    capabilities?: Record<string, unknown>;
  };
  error?: { code?: number; message?: string };
}

export interface StdioMasterGoConnectionOptions {
  timeoutMs?: number;
  protocolVersion?: string;
}

export class StdioMasterGoConnection implements MasterGoConnection {
  private process?: ChildProcessWithoutNullStreams;
  private nextId = 1;

  constructor(
    private readonly config: MasterGoMcpConfig,
    private readonly options: StdioMasterGoConnectionOptions = {},
  ) {}

  async probe(): Promise<MasterGoConnectionInfo> {
    if (this.process) throw new Error("MasterGo MCP 连接已启动。");
    const child = spawn(this.config.command, this.config.args, {
      env: { ...process.env, ...this.config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    const id = this.nextId++;
    const timeoutMs = this.options.timeoutMs ?? 10_000;
    const stderr: string[] = [];
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => stderr.push(chunk));

    const response = await new Promise<JsonRpcResponse>((resolve, reject) => {
      const lines = readline.createInterface({ input: child.stdout });
      const timer = setTimeout(() => {
        lines.close();
        reject(new Error(`initialize 超时（${timeoutMs}ms）${stderr.length ? `：${stderr.join("").trim()}` : ""}`));
      }, timeoutMs);
      const finish = (callback: () => void) => {
        clearTimeout(timer);
        lines.close();
        callback();
      };
      child.once("error", (error) => finish(() => reject(error)));
      child.once("exit", (code) => finish(() => reject(new Error(`MCP Server 在 initialize 前退出（code=${code}）${stderr.length ? `：${stderr.join("").trim()}` : ""}`))));
      lines.on("line", (line) => {
        if (!line.trim()) return;
        try {
          const message = JSON.parse(line) as JsonRpcResponse;
          if (message.id === id) finish(() => resolve(message));
        } catch {
          // Ignore non-JSON server logging written to stdout.
        }
      });
      child.stdin.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "initialize",
        params: {
          protocolVersion: this.options.protocolVersion ?? "2025-06-18",
          capabilities: {},
          clientInfo: { name: "pd-ai-engine", version: "0.6.0" },
        },
      })}\n`);
    });

    if (response.error) throw new Error(`initialize 被拒绝：${response.error.message ?? response.error.code ?? "unknown error"}`);
    if (!response.result) throw new Error("initialize 响应缺少 result。");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    return {
      serverName: response.result.serverInfo?.name,
      serverVersion: response.result.serverInfo?.version,
      capabilities: Object.keys(response.result.capabilities ?? {}).sort(),
    };
  }

  async close(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    if (!child || child.exitCode !== null) return;
    child.stdin.end();
    child.kill("SIGTERM");
  }
}
