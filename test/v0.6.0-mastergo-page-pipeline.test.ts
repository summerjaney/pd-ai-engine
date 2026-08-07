import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeMasterGoPagePipeline, extractGeneratedHtml } from "../src/integrations/mastergo/page-pipeline.js";
import type { MasterGoConnection } from "../src/integrations/mastergo/types.js";

test("TC-060-013: 从 design_page 结果提取完整 HTML", () => {
  const html = extractGeneratedHtml({ content: [{ type: "text", text: "已生成\n<!doctype html><html><body>用户</body></html>" }] });
  assert.match(html, /^<!doctype html>/i);
});

test("TC-060-014: 未明确确认时在连接前阻断真实写入", async () => {
  const connection = {} as MasterGoConnection;
  await assert.rejects(executeMasterGoPagePipeline("/unused", connection, { confirmedWrite: false }), /显式确认/);
});

test("TC-060-015: 按 design_page 到 submit_page_to_canvas 顺序写入并留痕", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-page-"));
  const directory = path.join(root, "07-mastergo");
  await mkdir(directory);
  await writeFile(path.join(directory, "mastergo-data.json"), JSON.stringify({
    schemaVersion: "0.2", product: { id: "p", name: "测试" }, tokens: { color: {}, spacing: {}, radius: {} },
    screens: [{ id: "users", name: "用户列表", route: "/users", pattern: "list", frame: { width: 1440, height: 900 }, nodes: [{ id: "search", name: "查询", type: "action", component: "button", description: "查询" }], interactions: [] }],
  }));
  const calls: Array<{ name: string; arguments_: Record<string, unknown> }> = [];
  const connection: MasterGoConnection = {
    probe: async () => ({ serverName: "fixture", capabilities: ["tools"] }),
    listTools: async () => ({ tools: [{ name: "design_page" }, { name: "submit_page_to_canvas" }], writableTools: ["submit_page_to_canvas"], hasCanvasWriteCapability: true }),
    callTool: async (name, arguments_) => {
      calls.push({ name, arguments_ });
      return name === "design_page"
        ? { content: [{ type: "text", text: "<!doctype html><html><body>用户列表</body></html>" }] }
        : { content: [{ type: "text", text: "submitted" }], structuredContent: { nodeId: "1:2" } };
    },
    close: async () => undefined,
  };
  const output = await executeMasterGoPagePipeline(root, connection, { confirmedWrite: true });
  assert.equal(output.status, "PASS");
  assert.deepEqual(calls.map((call) => call.name), ["design_page", "submit_page_to_canvas"]);
  assert.equal(calls[0].arguments_.designSource, "free-draw");
  assert.equal(calls[0].arguments_.userConfirmedDesignSource, true);
  assert.match(String(calls[1].arguments_.code), /用户列表/);
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.completedCalls, ["design_page", "submit_page_to_canvas"]);
});

test("TC-060-016: design_page 返回规则时提交 PAE 已生成的完整 prototype.html", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-fallback-"));
  await mkdir(path.join(root, "07-mastergo"), { recursive: true });
  await mkdir(path.join(root, "06-prototype"), { recursive: true });
  await writeFile(path.join(root, "07-mastergo", "mastergo-data.json"), JSON.stringify({
    schemaVersion: "0.2", product: { id: "p", name: "测试" }, tokens: { color: {}, spacing: {}, radius: {} },
    screens: [{ id: "users", name: "用户列表", route: "/users", pattern: "list", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] }],
  }));
  await writeFile(path.join(root, "06-prototype", "prototype.html"), "<!doctype html><html><body>PAE 原型</body></html>");
  let submittedCode = "";
  const connection: MasterGoConnection = {
    probe: async () => ({ capabilities: ["tools"] }),
    listTools: async () => ({ tools: [{ name: "design_page" }, { name: "submit_page_to_canvas" }], writableTools: [], hasCanvasWriteCapability: true }),
    callTool: async (name, arguments_) => {
      if (name === "design_page") return { content: [{ type: "text", text: "请遵循页面生成规范" }] };
      submittedCode = String(arguments_.code);
      return { content: [{ type: "text", text: "ok" }] };
    },
    close: async () => undefined,
  };
  const output = await executeMasterGoPagePipeline(root, connection, { confirmedWrite: true });
  assert.equal(output.status, "PASS");
  assert.match(submittedCode, /PAE 原型/);
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.htmlSource, "prototype.html");
});
