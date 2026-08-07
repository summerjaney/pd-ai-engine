import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMasterGoMcpConfig } from "../src/integrations/mastergo/config.js";
import { diagnoseMasterGo } from "../src/integrations/mastergo/doctor.js";
import type { MasterGoConnection } from "../src/integrations/mastergo/types.js";

const now = () => new Date("2026-08-07T01:00:00.000Z");

test("TC-060-004: 未配置 MasterGo MCP 时返回明确诊断", async () => {
  const report = await diagnoseMasterGo(undefined, { now });
  assert.equal(report.status, "NOT_CONFIGURED");
  assert.equal(report.checks[2].status, "SKIPPED");
});

test("TC-060-005: 支持读取标准 mcpServers.mastergo 配置", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-config-"));
  const configPath = path.join(root, "mcp.json");
  await writeFile(configPath, JSON.stringify({ mcpServers: { mastergo: { command: "/bin/sh", args: ["-c", "server"] } } }));
  const loaded = await loadMasterGoMcpConfig({ PAE_MASTERGO_MCP_CONFIG: configPath }, root);
  assert.equal(loaded?.config.command, "/bin/sh");
  assert.deepEqual(loaded?.config.args, ["-c", "server"]);
});

test("TC-060-006: 命令不可访问时不误报连接成功", async () => {
  const report = await diagnoseMasterGo({
    source: "test", config: { command: "missing-mastergo-command", args: [] },
  }, { now, path: "" });
  assert.equal(report.status, "COMMAND_NOT_FOUND");
  assert.equal(report.checks[2].status, "SKIPPED");
});

test("TC-060-007: 可替换连接契约记录真实探测结果并关闭连接", async () => {
  let closed = false;
  const connection: MasterGoConnection = {
    probe: async () => ({ serverName: "mastergo", serverVersion: "1.0", capabilities: ["tools"] }),
    close: async () => { closed = true; },
  };
  const report = await diagnoseMasterGo({
    source: "test", config: { command: "/bin/sh", args: [] },
  }, { now, connectionFactory: async () => connection });
  assert.equal(report.status, "READY");
  assert.equal(report.checks[2].status, "PASS");
  assert.deepEqual(report.connection?.capabilities, ["tools"]);
  assert.equal(closed, true);
});

test("TC-060-008: MCP 探测失败时返回失败而非 READY", async () => {
  const connection: MasterGoConnection = {
    probe: async () => { throw new Error("initialize timeout"); },
    close: async () => undefined,
  };
  const report = await diagnoseMasterGo({
    source: "test", config: { command: "/bin/sh", args: [] },
  }, { now, connectionFactory: async () => connection });
  assert.equal(report.status, "PROBE_FAILED");
  assert.match(report.checks[2].message, /initialize timeout/);
});
