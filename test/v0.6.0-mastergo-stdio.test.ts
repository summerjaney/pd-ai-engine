import assert from "node:assert/strict";
import test from "node:test";
import { StdioMasterGoConnection } from "../src/integrations/mastergo/stdio-connection.js";

test("TC-060-009: stdio 连接完成 MCP initialize 并读取服务能力", async () => {
  const server = [
    "const readline = require('node:readline');",
    "readline.createInterface({ input: process.stdin }).on('line', line => {",
    " const request = JSON.parse(line);",
    " if (request.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { serverInfo: { name: 'mastergo-fixture', version: '1.2.3' }, capabilities: { tools: {}, resources: {} } } }) + '\\n');",
    "});",
  ].join(" ");
  const connection = new StdioMasterGoConnection({ command: process.execPath, args: ["-e", server] }, { timeoutMs: 2_000 });
  try {
    const info = await connection.probe();
    assert.equal(info.serverName, "mastergo-fixture");
    assert.equal(info.serverVersion, "1.2.3");
    assert.deepEqual(info.capabilities, ["resources", "tools"]);
  } finally {
    await connection.close();
  }
});

test("TC-060-010: stdio initialize 超时会明确失败并可安全关闭", async () => {
  const connection = new StdioMasterGoConnection({
    command: process.execPath,
    args: ["-e", "process.stdin.resume()"],
  }, { timeoutMs: 30 });
  await assert.rejects(connection.probe(), /initialize 超时/);
  await connection.close();
});
