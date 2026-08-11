import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildMasterGoCanvasLayout, executeMasterGoPagePipeline, extractGeneratedHtml, renderMasterGoScreenHtml, validateMasterGoHtml } from "../src/integrations/mastergo/page-pipeline.js";
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
  assert.match(String(calls[1].arguments_.code), /用户列表<\/span>/);
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.status, "PASS");
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].screenId, "users");
  assert.equal(result.pages[0].status, "PASS");
});

test("TC-060-016: 每个 screen 独立生成静态 HTML 并逐页提交", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-fallback-"));
  await mkdir(path.join(root, "07-mastergo"), { recursive: true });
  await mkdir(path.join(root, "06-prototype"), { recursive: true });
  await writeFile(path.join(root, "07-mastergo", "mastergo-data.json"), JSON.stringify({
    schemaVersion: "0.2", product: { id: "p", name: "测试" }, tokens: { color: {}, spacing: {}, radius: {} },
    screens: [
      { id: "users", name: "用户列表", route: "/users", pattern: "list", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] },
      { id: "form", name: "用户表单", route: "/users/form", pattern: "form", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] },
    ],
  }));
  await writeFile(path.join(root, "06-prototype", "prototype.html"), "<!doctype html><html><body>PAE 原型</body></html>");
  const submittedCodes: string[] = [];
  const connection: MasterGoConnection = {
    probe: async () => ({ capabilities: ["tools"] }),
    listTools: async () => ({ tools: [{ name: "design_page" }, { name: "submit_page_to_canvas" }], writableTools: [], hasCanvasWriteCapability: true }),
    callTool: async (name, arguments_) => {
      if (name === "design_page") return { content: [{ type: "text", text: "请遵循页面生成规范" }] };
      submittedCodes.push(String(arguments_.code));
      return { content: [{ type: "text", text: "ok" }] };
    },
    close: async () => undefined,
  };
  const output = await executeMasterGoPagePipeline(root, connection, { confirmedWrite: true });
  assert.equal(output.status, "PASS");
  assert.equal(submittedCodes.length, 2);
  assert.match(submittedCodes[0], /用户列表/);
  assert.match(submittedCodes[1], /用户表单/);
  assert.doesNotMatch(submittedCodes.join(""), /PAE 原型/);
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[0].htmlSource, "pae.staticScreenHtml");
});

test("TC-060-017: accepted 仅标记待验证，不误报 PASS", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-accepted-"));
  await mkdir(path.join(root, "07-mastergo"), { recursive: true });
  await writeFile(path.join(root, "07-mastergo", "mastergo-data.json"), JSON.stringify({ schemaVersion: "0.2", product: { name: "测试" }, tokens: { color: {}, spacing: {}, radius: {} }, screens: [{ id: "p1", name: "页面", route: "/", pattern: "list", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] }] }));
  const connection: MasterGoConnection = {
    probe: async () => ({ capabilities: ["tools"] }),
    listTools: async () => ({ tools: [{ name: "design_page" }, { name: "submit_page_to_canvas" }], writableTools: [], hasCanvasWriteCapability: true }),
    callTool: async (name) => name === "design_page" ? { content: [{ type: "text", text: "规则" }] } : { content: [{ type: "text", text: "状态: accepted（已受理，非最终渲染完成回执）" }] },
    close: async () => undefined,
  };
  const output = await executeMasterGoPagePipeline(root, connection, { confirmedWrite: true });
  assert.equal(output.status, "PENDING_VERIFICATION");
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.status, "PENDING_VERIFICATION");
  assert.equal(result.verificationRequired, true);
});

test("TC-060-018: 静态画布 HTML 不隐藏页面且不依赖脚本", () => {
  const data = { schemaVersion: "0.2", product: { name: "用户管理" }, tokens: { color: {}, spacing: {}, radius: {} }, screens: [] } as any;
  const html = renderMasterGoScreenHtml(data, { id: "p1", name: "用户列表", route: "/users", pattern: "list", frame: { width: 1440, height: 900 }, nodes: [{ id: "name", name: "姓名", type: "field", component: "Input", description: "" }], interactions: [] });
  assert.match(html, /姓名/);
  assert.match(html, /^<main\b/i);
  assert.doesNotMatch(html, /<!doctype|<html|<body|<script|display:\s*none|var\(--|\sstyle=|<table/i);
  assert.doesNotThrow(() => validateMasterGoHtml(html));
});

test("TC-060-018A: MasterGo 协议校验在 MCP 调用前拒绝不兼容 HTML", () => {
  assert.throws(
    () => validateMasterGoHtml('<main data-name="bad" style="margin:8px"><table><tr><td>bad</td></tr></table></main>'),
    /禁止内联 style.*禁止原生表格或表单标签/,
  );
});

test("TC-080-011: 组织结构画布渲染组织树和组织字段而非用户列表", () => {
  const data = { schemaVersion: "0.2", product: { name: "组织结构管理" }, tokens: { color: {}, spacing: {}, radius: {} }, screens: [] } as any;
  const html = renderMasterGoScreenHtml(data, {
    id: "P1-organization-tree", name: "组织结构", route: "/organizations", pattern: "list", frame: { width: 1440, height: 900 },
    nodes: [
      { id: "P1-organization-tree.field.keyword", name: "组织名称/编码", type: "field", component: "text-input", description: "" },
      { id: "P1-organization-tree.field.status", name: "组织状态", type: "field", component: "select", description: "" },
      { id: "P1-organization-tree.action.search", name: "查询", type: "action", component: "primary-button", description: "" },
      { id: "P1-organization-tree.action.reset", name: "重置", type: "action", component: "secondary-button", description: "" },
      { id: "P1-organization-tree.action.create-child", name: "新增下级组织", type: "action", component: "secondary-button", description: "" },
    ], interactions: [],
  });
  assert.match(html, /组织层级/);
  assert.match(html, /集团总部/);
  assert.match(html, /组织编码/);
  assert.match(html, /组织负责人/);
  assert.match(html, /新增下级组织/);
  assert.doesNotMatch(html, /用户列表|张伟|user001/);
  assert.doesNotThrow(() => validateMasterGoHtml(html));
});

test("TC-060-019: 写入失败时保存原始响应、失败阶段和提交 HTML", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-evidence-"));
  const directory = path.join(root, "07-mastergo");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "mastergo-data.json"), JSON.stringify({ schemaVersion: "0.2", product: { name: "测试" }, tokens: { color: {}, spacing: {}, radius: {} }, screens: [{ id: "p/1", name: "页面", route: "/", pattern: "list", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] }] }));
  const connection: MasterGoConnection = {
    probe: async () => ({ capabilities: ["tools"] }),
    listTools: async () => ({ tools: [{ name: "design_page" }, { name: "submit_page_to_canvas" }], writableTools: [], hasCanvasWriteCapability: true }),
    callTool: async (name) => name === "design_page"
      ? { content: [{ type: "text", text: "设计规则" }] }
      : { isError: true, content: [{ type: "text", text: "HTML validation failed" }] },
    close: async () => undefined,
  };
  const output = await executeMasterGoPagePipeline(root, connection, { confirmedWrite: true });
  assert.equal(output.status, "FAIL");
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.schemaVersion, "0.4");
  assert.equal(result.pages[0].stage, "submit_page_to_canvas");
  assert.equal(result.pages[0].submitResult.isError, true);
  assert.match(result.errors[0], /HTML validation failed/);
  assert.match(await readFile(path.join(directory, result.pages[0].htmlArtifact), "utf8"), /^<main\b/i);
});

test("TC-070-009: 多页面严格串行并在失败页面停止且逐页持久化", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-serial-"));
  const directory = path.join(root, "07-mastergo");
  await mkdir(directory, { recursive: true });
  const screen = (id: string) => ({ id, name: `页面${id}`, route: `/${id}`, pattern: "form", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] });
  await writeFile(path.join(directory, "mastergo-data.json"), JSON.stringify({ schemaVersion: "0.2", product: { name: "测试" }, tokens: { color: {}, spacing: {}, radius: {} }, screens: [screen("P1"), screen("P2"), screen("P3")] }));
  const calls: string[] = [];
  const connection: MasterGoConnection = {
    probe: async () => ({ capabilities: ["tools"] }),
    listTools: async () => ({ tools: [{ name: "design_page" }, { name: "submit_page_to_canvas" }], writableTools: [], hasCanvasWriteCapability: true }),
    callTool: async (name, arguments_) => {
      calls.push(`${name}:${String(arguments_.code ?? "design")}`);
      if (name === "submit_page_to_canvas" && String(arguments_.code).includes("页面P2")) return { isError: true, content: [{ type: "text", text: "P2 failed" }] };
      return { content: [{ type: "text", text: "ok" }] };
    },
    close: async () => undefined,
  };
  const output = await executeMasterGoPagePipeline(root, connection, { confirmedWrite: true });
  assert.equal(output.status, "FAIL");
  assert.equal(calls.filter((call) => call.startsWith("submit_page_to_canvas")).length, 2);
  assert.ok(calls.every((call) => !call.includes("页面P3")));
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.schemaVersion, "0.4");
  assert.deepEqual(result.pages.map((page: any) => page.screenId), ["P1", "P2"]);
  assert.equal(result.pages[0].status, "PASS");
  assert.equal(result.pages[1].status, "FAIL");
});

test("TC-070-010: 失败续跑跳过已提交页面并从失败页面继续", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-resume-"));
  const directory = path.join(root, "07-mastergo");
  await mkdir(directory, { recursive: true });
  const screen = (id: string) => ({ id, name: `页面${id}`, route: `/${id}`, pattern: "form", frame: { width: 1440, height: 900 }, nodes: [], interactions: [] });
  await writeFile(path.join(directory, "mastergo-data.json"), JSON.stringify({ schemaVersion: "0.2", product: { name: "测试" }, tokens: { color: {}, spacing: {}, radius: {} }, screens: [screen("P1"), screen("P2"), screen("P3")] }));
  await writeFile(path.join(directory, "mastergo-write-result.json"), JSON.stringify({ schemaVersion: "0.4", status: "FAIL", startedAt: "2026-08-10T00:00:00.000Z", pages: [{ screenId: "P1", screenName: "页面P1", status: "PASS", stage: "completed" }, { screenId: "P2", screenName: "页面P2", status: "FAIL", stage: "submit_page_to_canvas" }], errors: ["P2 failed"] }));
  const submitted: string[] = [];
  const connection: MasterGoConnection = {
    probe: async () => ({ capabilities: ["tools"] }),
    listTools: async () => ({ tools: [{ name: "design_page" }, { name: "submit_page_to_canvas" }], writableTools: [], hasCanvasWriteCapability: true }),
    callTool: async (name, arguments_) => {
      if (name === "submit_page_to_canvas") submitted.push(String(arguments_.code));
      return { content: [{ type: "text", text: "ok" }] };
    },
    close: async () => undefined,
  };
  const output = await executeMasterGoPagePipeline(root, connection, { confirmedWrite: true, resume: true });
  assert.equal(output.status, "PASS");
  assert.equal(submitted.length, 2);
  assert.ok(submitted[0].includes("页面P2"));
  assert.ok(submitted[1].includes("页面P3"));
  assert.ok(submitted.every((html) => !html.includes("页面P1")));
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.resumed, true);
  assert.equal(result.pages[0].resumedAction, "SKIPPED_ALREADY_SUBMITTED");
  assert.deepEqual(result.pages.map((page: any) => page.status), ["PASS", "PASS", "PASS"]);
});

test("TC-070-011: 多页面画布按统一间距生成确定性布局", () => {
  const screen = (id: string, width: number, height: number) => ({ id, name: `页面${id}`, route: `/${id}`, pattern: "form" as const, frame: { width, height }, nodes: [], interactions: [] });
  const horizontal = buildMasterGoCanvasLayout([screen("P1", 1440, 900), screen("P2", 1200, 800)], "horizontal", 120);
  assert.deepEqual(horizontal.map(({ x, y }) => ({ x, y })), [{ x: 0, y: 0 }, { x: 1560, y: 0 }]);
  assert.deepEqual(horizontal.map(({ order }) => order), [0, 1]);
  const vertical = buildMasterGoCanvasLayout([screen("P1", 1440, 900), screen("P2", 1200, 800)], "vertical", 80);
  assert.deepEqual(vertical.map(({ x, y }) => ({ x, y })), [{ x: 0, y: 0 }, { x: 0, y: 980 }]);
});
