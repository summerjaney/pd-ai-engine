import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type { MasterGoConnection, MasterGoConnectionInfo, MasterGoMcpConfig, MasterGoTool, MasterGoToolDiscovery } from "./types.js";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: {
    serverInfo?: { name?: string; version?: string };
    capabilities?: Record<string, unknown>;
    tools?: MasterGoTool[];
    nextCursor?: string;
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
  private lines?: readline.Interface;
  private pending = new Map<number, { resolve: (response: JsonRpcResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private stderr: string[] = [];

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
    const timeoutMs = this.options.timeoutMs ?? 10_000;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => this.stderr.push(chunk));
    this.lines = readline.createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.routeLine(line));
    const failPending = (error: Error) => {
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
      this.pending.clear();
    };
    child.once("error", failPending);
    child.once("exit", (code) => failPending(new Error(`MCP Server 已退出（code=${code}）${this.stderr.length ? `：${this.stderr.join("").trim()}` : ""}`)));

    const response = await this.request("initialize", {
          protocolVersion: this.options.protocolVersion ?? "2025-06-18",
          capabilities: {},
          clientInfo: { name: "pd-ai-engine", version: "0.6.0" },
        }, timeoutMs);

    if (response.error) throw new Error(`initialize 被拒绝：${response.error.message ?? response.error.code ?? "unknown error"}`);
    if (!response.result) throw new Error("initialize 响应缺少 result。");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    return {
      serverName: response.result.serverInfo?.name,
      serverVersion: response.result.serverInfo?.version,
      capabilities: Object.keys(response.result.capabilities ?? {}).sort(),
    };
  }

  async listTools(): Promise<MasterGoToolDiscovery> {
    if (!this.process) throw new Error("请先完成 MasterGo MCP initialize。");
    const tools: MasterGoTool[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.request("tools/list", cursor ? { cursor } : {});
      if (response.error) throw new Error(`tools/list 被拒绝：${response.error.message ?? response.error.code ?? "unknown error"}`);
      tools.push(...(response.result?.tools ?? []));
      cursor = response.result?.nextCursor;
    } while (cursor);
    const writePattern = /\b(create|insert|add|update|set|write|render|append)\b|(^|[_/-])(create|insert|add|update|set|write|render|append)([_/-]|$)|画布|创建|新增|写入/i;
    const writableTools = tools.filter((tool) => writePattern.test(`${tool.name} ${tool.description ?? ""}`)).map((tool) => tool.name);
    return { tools, writableTools, hasCanvasWriteCapability: writableTools.length > 0 };
  }

  private routeLine(line: string): void {
    if (!line.trim()) return;
    try {
      const message = JSON.parse(line) as JsonRpcResponse;
      if (typeof message.id !== "number") return;
      const request = this.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(message.id);
      request.resolve(message);
    } catch { /* Ignore non-JSON server logging written to stdout. */ }
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs = this.options.timeoutMs ?? 10_000): Promise<JsonRpcResponse> {
    const child = this.process;
    if (!child) throw new Error("MasterGo MCP 连接未启动。");
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时（${timeoutMs}ms）${this.stderr.length ? `：${this.stderr.join("").trim()}` : ""}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async close(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    this.lines?.close();
    this.lines = undefined;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error("MasterGo MCP 连接已关闭。")); }
    this.pending.clear();
    if (!child || child.exitCode !== null) return;
    child.stdin.end();
    child.kill("SIGTERM");
  }
}
