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

test("TC-060-011: tools/list 支持分页并识别画布写入候选工具", async () => {
  const server = [
    "const readline = require('node:readline');",
    "readline.createInterface({ input: process.stdin }).on('line', line => {",
    " const r = JSON.parse(line); let result;",
    " if (r.method === 'initialize') result = { serverInfo: { name: 'fixture' }, capabilities: { tools: {} } };",
    " if (r.method === 'tools/list' && !r.params.cursor) result = { tools: [{ name: 'get_document' }], nextCursor: '2' };",
    " if (r.method === 'tools/list' && r.params.cursor) result = { tools: [{ name: 'create_frame', description: 'Create a frame on canvas', inputSchema: { type: 'object' } }] };",
    " if (result) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: r.id, result }) + '\\n');",
    "});",
  ].join(" ");
  const connection = new StdioMasterGoConnection({ command: process.execPath, args: ["-e", server] }, { timeoutMs: 2_000 });
  try {
    await connection.probe();
    const discovery = await connection.listTools();
    assert.deepEqual(discovery.tools.map((tool) => tool.name), ["get_document", "create_frame"]);
    assert.deepEqual(discovery.writableTools, ["create_frame"]);
    assert.equal(discovery.hasCanvasWriteCapability, true);
  } finally { await connection.close(); }
});

test("TC-060-012: tools/call 传递真实参数并返回结构化结果", async () => {
  const server = [
    "const readline = require('node:readline');",
    "readline.createInterface({ input: process.stdin }).on('line', line => {",
    " const r = JSON.parse(line); let result;",
    " if (r.method === 'initialize') result = { serverInfo: { name: 'fixture' }, capabilities: { tools: {} } };",
    " if (r.method === 'tools/call') result = { content: [{ type: 'text', text: r.params.name }], structuredContent: { received: r.params.arguments } };",
    " if (result) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: r.id, result }) + '\\n');",
    "});",
  ].join(" ");
  const connection = new StdioMasterGoConnection({ command: process.execPath, args: ["-e", server] }, { timeoutMs: 2_000 });
  try {
    await connection.probe();
    const result = await connection.callTool("design_page", { prompt: "用户管理" });
    assert.equal(result.content[0]?.text, "design_page");
    assert.deepEqual(result.structuredContent, { received: { prompt: "用户管理" } });
  } finally { await connection.close(); }
});
