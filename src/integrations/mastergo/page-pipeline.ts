import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MasterGoData, MasterGoScreen, MasterGoScreenNode } from "../../domain/types.js";
import type { MasterGoConnection, MasterGoToolCallResult } from "./types.js";

export interface MasterGoPagePipelineOptions { confirmedWrite: boolean; now?: () => Date; }
export interface MasterGoPagePipelineOutput {
  planPath: string;
  resultPath: string;
  status: "PASS" | "PENDING_VERIFICATION" | "FAIL";
}

function safeArtifactName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "screen";
}

function textValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const preferred = ["code", "html", "text", "content"].flatMap((key) => textValues(record[key]));
  return preferred.length ? preferred : Object.values(record).flatMap(textValues);
}

export function extractGeneratedHtml(result: MasterGoToolCallResult): string {
  const values = [...textValues(result.structuredContent), ...textValues(result.content)];
  const html = values.find((value) => /<!doctype html|<html[\s>]/i.test(value));
  if (!html) throw new Error("design_page 未返回可提交的完整 HTML。");
  return html.slice(html.search(/<!doctype html|<html[\s>]/i)).trim();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function fieldControl(node: MasterGoScreenNode): string {
  const name = escapeHtml(node.name);
  const required = node.required ? '<span style="color:#ff4d4f"> *</span>' : "";
  const suffix = /select/i.test(node.component) ? "⌄" : "";
  return `<div style="width:280px;margin:0 16px 20px 0;display:inline-block;vertical-align:top"><div style="font-size:14px;color:#333;margin-bottom:8px">${name}${required}</div><div style="height:40px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;padding:10px 12px;color:#999;font-size:14px">请输入${name}<span style="float:right">${suffix}</span></div></div>`;
}

/** Render one static, fully visible page. MasterGo converts this HTML to editable canvas nodes. */
export function renderMasterGoScreenHtml(data: MasterGoData, screen: MasterGoScreen): string {
  const fields = screen.nodes.filter((node) => node.type === "field");
  const actions = screen.nodes.filter((node) => node.type === "action");
  const primary = actions.find((node) => /^(查询|保存|新增)/.test(node.name));
  const secondary = actions.filter((node) => node !== primary);
  const button = (node: MasterGoScreenNode, main = false) => `<span style="display:inline-block;height:36px;line-height:36px;padding:0 18px;margin-left:8px;border-radius:4px;border:1px solid ${main ? "#1890ff" : "#d9d9d9"};background:${main ? "#1890ff" : "#fff"};color:${main ? "#fff" : "#333"};font-size:14px">${escapeHtml(node.name)}</span>`;
  const body = screen.pattern === "list"
    ? `<div style="padding:24px;background:#fff;border-radius:4px"><div>${fields.map(fieldControl).join("")}</div><div style="text-align:right">${primary ? button(primary, true) : ""}${secondary.slice(0, 2).map((node) => button(node)).join("")}</div></div><div style="margin-top:16px;padding:20px 24px;background:#fff;border-radius:4px"><div style="margin-bottom:18px"><span style="font-size:16px;font-weight:600">用户列表</span><span style="float:right">${actions.filter((node) => ![primary, ...secondary.slice(0, 2)].includes(node)).map((node, index) => button(node, index === 0)).join("")}</span></div><table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="height:48px;background:#fafafa;color:#555">${fields.slice(0, 7).map((node) => `<th style="text-align:left;padding:0 12px;border-bottom:1px solid #eee">${escapeHtml(node.name)}</th>`).join("")}<th style="text-align:left;padding:0 12px;border-bottom:1px solid #eee">操作</th></tr>${["张伟", "李娜", "王强"].map((name, i) => `<tr style="height:54px"><td style="padding:0 12px;border-bottom:1px solid #eee">${name}</td>${fields.slice(1, 7).map((node, j) => `<td style="padding:0 12px;border-bottom:1px solid #eee;color:#555">${j === 0 ? `user00${i + 1}` : j === 4 ? "启用" : "示例数据"}</td>`).join("")}<td style="padding:0 12px;border-bottom:1px solid #eee;color:#1890ff">查看　编辑</td></tr>`).join("")}</table><div style="margin-top:18px;text-align:right;color:#666;font-size:14px">共 3 条　1 / 1</div></div>`
    : `<div style="padding:32px;background:#fff;border-radius:4px"><div style="max-width:900px">${fields.map(fieldControl).join("")}</div><div style="margin-top:12px;padding-top:24px;border-top:1px solid #eee;text-align:right">${secondary.map((node) => button(node)).join("")}${primary ? button(primary, true) : ""}</div></div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(screen.name)}</title></head><body style="margin:0;width:${screen.frame.width}px;min-height:${screen.frame.height}px;background:#f5f7fa;font-family:Arial,'PingFang SC',sans-serif;color:#333"><div style="height:56px;background:#18233c;color:#fff;padding:0 24px;line-height:56px;font-size:18px">${escapeHtml(data.product.name)}</div><div style="padding:24px 32px"><div style="margin-bottom:20px"><span style="font-size:20px;font-weight:600">${escapeHtml(screen.name)}</span><span style="margin-left:12px;color:#999;font-size:13px">${escapeHtml(screen.route)}</span></div>${body}</div></body></html>`;
}

function describeScreen(screen: MasterGoScreen): string {
  return `根据 PAE 已确认的 B 端原型生成一个可编辑页面：${screen.name}。包含：${screen.nodes.map((node) => node.name).join("、")}。保持字段、操作和中文文案，不虚构业务规则。`;
}

function isAcceptedOnly(result: MasterGoToolCallResult): boolean {
  const text = textValues(result).join("\n");
  return /accepted|已受理|后台处理中|非最终渲染完成/i.test(text);
}

export async function executeMasterGoPagePipeline(requirementDirectory: string, connection: MasterGoConnection, options: MasterGoPagePipelineOptions): Promise<MasterGoPagePipelineOutput> {
  if (!options.confirmedWrite) throw new Error("真实画布写入需要显式确认：--confirm-write。");
  const directory = path.join(requirementDirectory, "07-mastergo");
  const data = JSON.parse(await readFile(path.join(directory, "mastergo-data.json"), "utf8")) as MasterGoData;
  if (data.schemaVersion !== "0.2" || !Array.isArray(data.screens) || data.screens.length === 0) throw new Error("MasterGo 适配数据无效：schemaVersion 必须为 0.2，且 screens 不能为空。");
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const planPath = path.join(directory, "mastergo-write-plan.json");
  const resultPath = path.join(directory, "mastergo-write-result.json");
  const plan = { schemaVersion: "0.2", generatedAt: startedAt, source: "07-mastergo/mastergo-data.json", confirmedWrite: true, pages: data.screens.map((screen) => ({ screenId: screen.id, screenName: screen.name, calls: [{ tool: "design_page", arguments: { requirement: describeScreen(screen), designSource: "free-draw", userConfirmedDesignSource: true } }, { tool: "submit_page_to_canvas", argumentsFrom: "pae.staticScreenHtml" }] })) };
  await mkdir(directory, { recursive: true });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const result: Record<string, unknown> = { schemaVersion: "0.3", status: "FAIL", startedAt, completedAt: startedAt, pages: [], errors: [] };
  try {
    const info = await connection.probe();
    const discovery = await connection.listTools();
    for (const required of ["design_page", "submit_page_to_canvas"]) if (!discovery.tools.some((tool) => tool.name === required)) throw new Error(`MasterGo MCP 缺少必需工具：${required}`);
    let pending = false;
    for (const screen of data.screens) {
      const pageResult: Record<string, unknown> = { screenId: screen.id, screenName: screen.name, status: "FAIL", stage: "design_page" };
      (result.pages as unknown[]).push(pageResult);
      const requirement = describeScreen(screen);
      const designed = await connection.callTool("design_page", { requirement, designSource: "free-draw", userConfirmedDesignSource: true });
      pageResult.designResult = designed;
      if (designed.isError) throw new Error(`${screen.name}：design_page 返回 isError=true：${textValues(designed).join(" | ") || "未返回错误详情"}`);
      const html = renderMasterGoScreenHtml(data, screen);
      const htmlArtifact = `mastergo-page-${safeArtifactName(screen.id)}.html`;
      await writeFile(path.join(directory, htmlArtifact), html, "utf8");
      Object.assign(pageResult, { stage: "submit_page_to_canvas", htmlSource: "pae.staticScreenHtml", htmlArtifact, htmlBytes: Buffer.byteLength(html) });
      const submitted = await connection.callTool("submit_page_to_canvas", { code: html });
      pageResult.submitResult = submitted;
      if (submitted.isError) throw new Error(`${screen.name}：submit_page_to_canvas 返回 isError=true：${textValues(submitted).join(" | ") || "未返回错误详情"}`);
      const acceptedOnly = isAcceptedOnly(submitted);
      pending ||= acceptedOnly;
      Object.assign(pageResult, { status: acceptedOnly ? "PENDING_VERIFICATION" : "PASS", stage: "completed" });
    }
    Object.assign(result, { status: pending ? "PENDING_VERIFICATION" : "PASS", server: info, verificationRequired: pending });
  } catch (error) {
    (result.errors as string[]).push(error instanceof Error ? error.message : String(error));
  } finally {
    result.completedAt = now().toISOString();
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await connection.close().catch(() => undefined);
  }
  return { planPath, resultPath, status: result.status as MasterGoPagePipelineOutput["status"] };
}
