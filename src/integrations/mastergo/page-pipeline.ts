import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MasterGoData } from "../../domain/types.js";
import type { MasterGoConnection, MasterGoToolCallResult } from "./types.js";

export interface MasterGoPagePipelineOptions {
  confirmedWrite: boolean;
  now?: () => Date;
}

export interface MasterGoPagePipelineOutput {
  planPath: string;
  resultPath: string;
  status: "PASS" | "FAIL";
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
  const start = html.search(/<!doctype html|<html[\s>]/i);
  return html.slice(start).trim();
}

function describe(data: MasterGoData): string {
  const pages = data.screens.map((screen) => {
    const nodes = Array.isArray(screen.nodes) ? screen.nodes.map((node) => node.name).filter(Boolean).join("、") : "";
    return `${screen.name}${nodes ? `（包含：${nodes}）` : ""}`;
  });
  return `根据 PAE 已确认的 B 端原型生成可编辑页面。页面：${pages.join("；")}。保持原型信息架构、字段、操作和中文文案，不虚构业务规则。`;
}

export async function executeMasterGoPagePipeline(
  requirementDirectory: string,
  connection: MasterGoConnection,
  options: MasterGoPagePipelineOptions,
): Promise<MasterGoPagePipelineOutput> {
  if (!options.confirmedWrite) throw new Error("真实画布写入需要显式确认：--confirm-write。");
  const directory = path.join(requirementDirectory, "07-mastergo");
  const sourcePath = path.join(directory, "mastergo-data.json");
  const data = JSON.parse(await readFile(sourcePath, "utf8")) as MasterGoData;
  if (data.schemaVersion !== "0.2" || !Array.isArray(data.screens) || data.screens.length === 0) {
    throw new Error("MasterGo 适配数据无效：schemaVersion 必须为 0.2，且 screens 不能为空。");
  }
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const planPath = path.join(directory, "mastergo-write-plan.json");
  const resultPath = path.join(directory, "mastergo-write-result.json");
  const requirement = describe(data);
  const plan = {
    schemaVersion: "0.1", generatedAt: startedAt, source: "07-mastergo/mastergo-data.json",
    confirmedWrite: true,
    calls: [
      { tool: "design_page", arguments: { requirement, designSource: "free-draw", userConfirmedDesignSource: true } },
      { tool: "submit_page_to_canvas", argumentsFrom: "design_page.completeHtml" },
    ],
  };
  await mkdir(directory, { recursive: true });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const result: Record<string, unknown> = { schemaVersion: "0.1", status: "FAIL", startedAt, completedAt: startedAt, completedCalls: [], errors: [] };
  try {
    const info = await connection.probe();
    const discovery = await connection.listTools();
    for (const required of ["design_page", "submit_page_to_canvas"]) {
      if (!discovery.tools.some((tool) => tool.name === required)) throw new Error(`MasterGo MCP 缺少必需工具：${required}`);
    }
    const designed = await connection.callTool("design_page", { requirement, designSource: "free-draw", userConfirmedDesignSource: true });
    if (designed.isError) throw new Error("design_page 返回 isError=true。");
    (result.completedCalls as string[]).push("design_page");
    let html: string;
    let htmlSource: "design_page" | "prototype.html" = "design_page";
    try {
      html = extractGeneratedHtml(designed);
    } catch {
      const prototypePath = path.join(requirementDirectory, "06-prototype", "prototype.html");
      html = (await readFile(prototypePath, "utf8")).trim();
      if (!/<!doctype html|<html[\s>]/i.test(html)) throw new Error("prototype.html 不是完整 HTML，已阻断画布提交。");
      htmlSource = "prototype.html";
    }
    const submitted = await connection.callTool("submit_page_to_canvas", { code: html });
    if (submitted.isError) throw new Error("submit_page_to_canvas 返回 isError=true。");
    (result.completedCalls as string[]).push("submit_page_to_canvas");
    Object.assign(result, { status: "PASS", server: info, htmlSource, htmlBytes: Buffer.byteLength(html), submitResult: submitted });
  } catch (error) {
    (result.errors as string[]).push(error instanceof Error ? error.message : String(error));
  } finally {
    result.completedAt = now().toISOString();
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await connection.close().catch(() => undefined);
  }
  return { planPath, resultPath, status: result.status as "PASS" | "FAIL" };
}
