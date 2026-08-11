import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MasterGoData, MasterGoScreen, MasterGoScreenNode } from "../../domain/types.js";
import type { MasterGoConnection, MasterGoToolCallResult } from "./types.js";

export interface MasterGoPagePipelineOptions { confirmedWrite: boolean; resume?: boolean; now?: () => Date; }
export interface MasterGoPagePipelineOutput {
  planPath: string;
  resultPath: string;
  status: "PASS" | "PENDING_VERIFICATION" | "FAIL";
}

export interface MasterGoCanvasPlacement {
  screenId: string;
  screenName: string;
  order: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function buildMasterGoCanvasLayout(
  screens: MasterGoScreen[],
  layout: "horizontal" | "vertical" = "horizontal",
  gap = 120,
): MasterGoCanvasPlacement[] {
  let offset = 0;
  return screens.map((screen, order) => {
    const placement = {
      screenId: screen.id, screenName: screen.name, order,
      x: layout === "horizontal" ? offset : 0,
      y: layout === "vertical" ? offset : 0,
      width: screen.frame.width, height: screen.frame.height,
    };
    offset += (layout === "horizontal" ? screen.frame.width : screen.frame.height) + gap;
    return placement;
  });
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

function text(name: string, value: string, className = "text-[14px] leading-[20px] font-[400] text-[#1D2129] text-left"): string {
  return `<span data-name="${escapeHtml(name)}" class="${className}">${escapeHtml(value)}</span>`;
}

function fieldControl(node: MasterGoScreenNode): string {
  const name = escapeHtml(node.name);
  const required = node.required ? text(`${node.id}-required`, "*", "text-[14px] leading-[20px] font-[500] text-[#F53F3F] text-left") : "";
  const suffix = /select/i.test(node.component) ? text(`${node.id}-suffix`, "⌄", "text-[14px] leading-[20px] font-[400] text-[#86909C] text-right") : "";
  return `<div data-name="field-${escapeHtml(node.id)}" class="flex flex-col justify-start items-stretch w-[280px] gap-[8px]"><div data-name="field-label-${escapeHtml(node.id)}" class="flex flex-row justify-start items-center gap-[4px]">${text(`${node.id}-label`, name)}${required}</div><div data-name="field-control-${escapeHtml(node.id)}" class="flex flex-row justify-between items-center self-stretch h-[40px] border-[1px] border-[#D9DDE4] rounded-[4px] bg-[#FFFFFF] px-[12px]">${text(`${node.id}-placeholder`, `请输入${name}`, "text-[14px] leading-[20px] font-[400] text-[#A9AEB8] text-left")}${suffix}</div></div>`;
}

function actionButton(node: MasterGoScreenNode, primary = false): string {
  return `<div data-name="action-${escapeHtml(node.id)}" class="flex flex-row justify-center items-center h-[36px] px-[18px] rounded-[4px] border-[1px] ${primary ? "border-[#1890FF] bg-[#1890FF]" : "border-[#D9DDE4] bg-[#FFFFFF]"}">${text(`${node.id}-text`, node.name, `text-[14px] leading-[20px] font-[500] ${primary ? "text-[#FFFFFF]" : "text-[#1D2129]"} text-center`)}</div>`;
}

function renderOrganizationTreeBody(fields: MasterGoScreenNode[], actions: MasterGoScreenNode[]): string {
  const searchFields = fields.filter((node) => /(?:keyword|status)$/.test(node.id));
  const searchActions = actions.filter((node) => /(?:search|reset)$/.test(node.id));
  const toolbarActions = actions.filter((node) => !searchActions.includes(node));
  const organizationColumns = ["组织名称", "组织编码", "组织类型", "组织负责人", "组织状态"];
  const cell = (name: string, value: string, classes = "text-[#4E5969]") => `<div data-name="${escapeHtml(name)}" class="flex flex-row justify-start items-center flex-1 min-w-[112px] px-[12px]">${text(`${name}-text`, value, `text-[14px] leading-[20px] font-[400] ${classes} text-left`)}</div>`;
  const treeNode = (name: string, label: string, active = false, indent = false) => `<div data-name="${name}" class="flex flex-row justify-start items-center self-stretch h-[40px] ${active ? "bg-[#E8F3FF]" : "bg-[#FFFFFF]"} px-[12px] gap-[8px]">${indent ? text(`${name}-indent`, "　", "text-[14px] leading-[20px] font-[400] text-[#86909C] text-left") : ""}${text(`${name}-toggle`, indent ? "•" : "⌄", "text-[14px] leading-[20px] font-[400] text-[#86909C] text-left")}${text(`${name}-label`, label, `text-[14px] leading-[20px] font-[${active ? "500" : "400"}] ${active ? "text-[#1890FF]" : "text-[#1D2129]"} text-left`)}</div>`;
  const detailRow = (index: number, values: string[]) => `<div data-name="organization-row-${index}" class="flex flex-row justify-start items-stretch self-stretch min-h-[54px] border-b-[1px] border-[#E5E6EB]">${values.map((value, column) => cell(`organization-row-${index}-${column}`, value)).join("")}${cell(`organization-row-${index}-operation`, "查看详情　编辑", "text-[#1890FF]")}</div>`;
  return `<div data-name="organization-search" class="flex flex-col justify-start items-stretch self-stretch bg-[#FFFFFF] rounded-[4px] p-[24px] gap-[20px]"><div data-name="organization-search-fields" class="flex flex-row justify-start items-start self-stretch gap-[16px]">${searchFields.map(fieldControl).join("")}</div><div data-name="organization-search-actions" class="flex flex-row justify-end items-center self-stretch gap-[8px]">${searchActions.map((node) => actionButton(node, /search$/.test(node.id))).join("")}</div></div><div data-name="organization-workspace" class="flex flex-row justify-start items-stretch self-stretch gap-[20px]"><div data-name="organization-tree-card" class="flex flex-col justify-start items-stretch w-[300px] bg-[#FFFFFF] rounded-[4px] p-[20px] gap-[12px]"><div data-name="organization-tree-heading" class="flex flex-row justify-between items-center self-stretch">${text("organization-tree-title", "组织层级", "text-[16px] leading-[24px] font-[600] text-[#1D2129] text-left")}${text("organization-tree-count", "共 5 个组织", "text-[13px] leading-[20px] font-[400] text-[#86909C] text-right")}</div><div data-name="organization-tree" class="flex flex-col justify-start items-stretch self-stretch border-[1px] border-[#E5E6EB] rounded-[4px] overflow-hidden">${treeNode("tree-headquarters", "集团总部")}${treeNode("tree-product-center", "产品中心", true, true)}${treeNode("tree-rd-center", "研发中心", false, true)}${treeNode("tree-marketing-center", "市场中心", false, true)}${treeNode("tree-chengdu", "成都分公司", false, true)}</div></div><div data-name="organization-list-card" class="flex flex-col justify-start items-stretch flex-1 bg-[#FFFFFF] rounded-[4px] p-[20px] gap-[18px]"><div data-name="organization-list-header" class="flex flex-row justify-between items-center self-stretch"><div data-name="selected-organization" class="flex flex-col justify-start items-start gap-[4px]">${text("organization-list-title", "产品中心", "text-[16px] leading-[24px] font-[600] text-[#1D2129] text-left")}${text("organization-list-context", "上级组织：集团总部", "text-[13px] leading-[20px] font-[400] text-[#86909C] text-left")}</div><div data-name="organization-toolbar" class="flex flex-row justify-end items-center gap-[8px]">${toolbarActions.map((node, index) => actionButton(node, index === 1)).join("")}</div></div><div data-name="organization-table" class="flex flex-col justify-start items-stretch self-stretch border-[1px] border-[#E5E6EB] rounded-[4px] overflow-hidden"><div data-name="organization-table-header" class="flex flex-row justify-start items-stretch self-stretch min-h-[48px] bg-[#F7F8FA] border-b-[1px] border-[#E5E6EB]">${organizationColumns.map((value, index) => cell(`organization-header-${index}`, value, "text-[#1D2129]")).join("")}${cell("organization-header-operation", "操作", "text-[#1D2129]")}</div>${detailRow(1, ["产品中心", "ORG-PRODUCT", "业务部门", "王芳", "启用"])}${detailRow(2, ["产品设计部", "ORG-PD", "部门", "陈晨", "启用"])}${detailRow(3, ["产品运营部", "ORG-PO", "部门", "刘敏", "启用"])}</div><div data-name="organization-pagination" class="flex flex-row justify-end items-center self-stretch">${text("organization-pagination-text", "共 3 条　1 / 1", "text-[14px] leading-[20px] font-[400] text-[#4E5969] text-right")}</div></div></div>`;
}

/** Reject syntax which MasterGo's HTML reverse-transpiler documents as non-convertible. */
export function validateMasterGoHtml(html: string): void {
  const violations: string[] = [];
  if (!/^<main\b/i.test(html.trim()) || !/<\/main>\s*$/i.test(html.trim())) violations.push("必须是单一 <main> 根节点片段");
  if (/<!doctype|<html\b|<head\b|<body\b/i.test(html)) violations.push("禁止提交文档外壳");
  if (/\sstyle\s*=/i.test(html)) violations.push("禁止内联 style");
  if (/<(?:table|thead|tbody|tfoot|tr|th|td|input|select|textarea|button|form)\b/i.test(html)) violations.push("禁止原生表格或表单标签");
  if (/\b(?:m|mx|my|mt|mr|mb|ml)-\[?[^\s\"]+/i.test(html)) violations.push("禁止 margin 工具类");
  if (/\b(?:grid|float-|w-full|h-full)\b/i.test(html)) violations.push("禁止 Grid、float 或相对尺寸");
  const tags = html.match(/<(?:main|div|span|p|i|img)\b[^>]*>/gi) ?? [];
  if (tags.some((tag) => !/\sdata-name="[^"]+"/i.test(tag))) violations.push("所有 DOM 节点必须包含 data-name");
  if (violations.length) throw new Error(`MasterGo HTML 协议校验失败：${violations.join("；")}`);
}

/** Render one static, fully visible page. MasterGo converts this HTML to editable canvas nodes. */
export function renderMasterGoScreenHtml(data: MasterGoData, screen: MasterGoScreen): string {
  const fields = screen.nodes.filter((node) => node.type === "field");
  const actions = screen.nodes.filter((node) => node.type === "action");
  const primary = actions.find((node) => /^(查询|保存|新增)/.test(node.name));
  const secondary = actions.filter((node) => node !== primary);
  const searchActions = [primary, ...secondary.slice(0, 2)].filter(Boolean) as MasterGoScreenNode[];
  const tableActions = actions.filter((node) => !searchActions.includes(node));
  const columns = fields.slice(0, 7);
  const cell = (name: string, value: string, emphasis = false) => `<div data-name="${escapeHtml(name)}" class="flex flex-row justify-start items-center flex-1 min-w-[112px] px-[12px]">${text(`${name}-text`, value, `text-[14px] leading-[20px] font-[${emphasis ? "500" : "400"}] ${emphasis ? "text-[#1890FF]" : "text-[#4E5969]"} text-left`)}</div>`;
  const row = (index: number, person: string) => `<div data-name="table-row-${index}" class="flex flex-row justify-start items-stretch self-stretch min-h-[54px] border-b-[1px] border-[#E5E6EB]">${columns.map((node, columnIndex) => cell(`row-${index}-${node.id}`, columnIndex === 0 ? person : columnIndex === 1 ? `user00${index}` : columnIndex === 5 ? "启用" : "示例数据")).join("")}${cell(`row-${index}-operation`, "查看　编辑", true)}</div>`;
  const body = screen.id === "P1-organization-tree"
    ? renderOrganizationTreeBody(fields, actions)
    : screen.pattern === "list"
    ? `<div data-name="search-card" class="flex flex-col justify-start items-stretch self-stretch bg-[#FFFFFF] rounded-[4px] p-[24px] gap-[20px]"><div data-name="search-fields" class="flex flex-row justify-start items-start self-stretch flex-wrap gap-[16px]">${fields.map(fieldControl).join("")}</div><div data-name="search-actions" class="flex flex-row justify-end items-center self-stretch gap-[8px]">${searchActions.map((node) => actionButton(node, node === primary)).join("")}</div></div><div data-name="list-card" class="flex flex-col justify-start items-stretch self-stretch bg-[#FFFFFF] rounded-[4px] p-[24px] gap-[18px]"><div data-name="list-header" class="flex flex-row justify-between items-center self-stretch">${text("list-title", "用户列表", "text-[16px] leading-[24px] font-[600] text-[#1D2129] text-left")}<div data-name="list-actions" class="flex flex-row justify-end items-center gap-[8px]">${tableActions.map((node, index) => actionButton(node, index === 0)).join("")}</div></div><div data-name="data-table" class="flex flex-col justify-start items-stretch self-stretch border-[1px] border-[#E5E6EB] rounded-[4px] overflow-hidden"><div data-name="table-header" class="flex flex-row justify-start items-stretch self-stretch min-h-[48px] bg-[#F7F8FA] border-b-[1px] border-[#E5E6EB]">${columns.map((node) => cell(`header-${node.id}`, node.name)).join("")}${cell("header-operation", "操作")}</div>${row(1, "张伟")}${row(2, "李娜")}${row(3, "王强")}</div><div data-name="pagination" class="flex flex-row justify-end items-center self-stretch">${text("pagination-text", "共 3 条　1 / 1", "text-[14px] leading-[20px] font-[400] text-[#4E5969] text-right")}</div></div>`
    : `<div data-name="form-card" class="flex flex-col justify-start items-stretch self-stretch bg-[#FFFFFF] rounded-[4px] p-[32px] gap-[24px]"><div data-name="form-fields" class="flex flex-row justify-start items-start self-stretch flex-wrap gap-[20px]">${fields.map(fieldControl).join("")}</div><div data-name="form-actions" class="flex flex-row justify-end items-center self-stretch pt-[24px] gap-[8px] border-t-[1px] border-[#E5E6EB]">${secondary.map((node) => actionButton(node)).join("")}${primary ? actionButton(primary, true) : ""}</div></div>`;
  const html = `<main data-name="${escapeHtml(screen.id)}-${escapeHtml(screen.name)}" class="flex flex-col justify-start items-stretch w-[${screen.frame.width}px] min-h-[${screen.frame.height}px] bg-[#F5F7FA]"><div data-name="top-bar" class="flex flex-row justify-start items-center self-stretch h-[56px] bg-[#18233C] px-[24px]">${text("product-name", data.product.name, "text-[18px] leading-[24px] font-[600] text-[#FFFFFF] text-left")}</div><div data-name="page-content" class="flex flex-col justify-start items-stretch self-stretch p-[32px] gap-[20px]"><div data-name="page-heading" class="flex flex-row justify-start items-center self-stretch gap-[12px]">${text("page-title", screen.name, "text-[20px] leading-[28px] font-[600] text-[#1D2129] text-left")}${text("page-route", screen.route, "text-[13px] leading-[20px] font-[400] text-[#86909C] text-left")}</div>${body}</div></main>`;
  validateMasterGoHtml(html);
  return html;
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
  let layoutDirection: "horizontal" | "vertical" = "horizontal";
  let layoutGap = 120;
  try {
    const context = JSON.parse(await readFile(path.join(requirementDirectory, "05-page-plan", "design-context.json"), "utf8")) as { frame?: { layout?: string; gap?: number } };
    if (context.frame?.layout === "vertical") layoutDirection = "vertical";
    if (typeof context.frame?.gap === "number" && context.frame.gap >= 0) layoutGap = context.frame.gap;
  } catch { /* Older requirement outputs use the stable defaults. */ }
  const canvasLayout = buildMasterGoCanvasLayout(data.screens, layoutDirection, layoutGap);
  const layoutPath = path.join(directory, "canvas-layout.json");
  await writeFile(layoutPath, `${JSON.stringify({ schemaVersion: "0.7", layout: layoutDirection, gap: layoutGap, pages: canvasLayout }, null, 2)}\n`, "utf8");
  const plan = { schemaVersion: "0.7", generatedAt: startedAt, source: "07-mastergo/mastergo-data.json", canvasLayout: "07-mastergo/canvas-layout.json", confirmedWrite: true, pages: data.screens.map((screen, index) => ({ screenId: screen.id, screenName: screen.name, placement: canvasLayout[index], calls: [{ tool: "design_page", arguments: { requirement: describeScreen(screen), designSource: "free-draw", userConfirmedDesignSource: true } }, { tool: "submit_page_to_canvas", argumentsFrom: "pae.staticScreenHtml" }] })) };
  await mkdir(directory, { recursive: true });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  let previous: Record<string, unknown> | undefined;
  if (options.resume) {
    try {
      previous = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;
    } catch {
      throw new Error("续跑需要已有 mastergo-write-result.json；请先执行一次真实写入。");
    }
  }
  const previousPages = Array.isArray(previous?.pages) ? previous.pages as Array<Record<string, unknown>> : [];
  const resumablePages = new Map(previousPages.map((page) => [String(page.screenId), page]));
  const result: Record<string, unknown> = {
    schemaVersion: "0.4", status: "FAIL", startedAt, completedAt: startedAt,
    resumed: Boolean(options.resume), resumedFrom: options.resume ? String(previous?.startedAt ?? "unknown") : undefined,
    pages: [], errors: [],
  };
  const persist = async () => writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  try {
    const info = await connection.probe();
    const discovery = await connection.listTools();
    for (const required of ["design_page", "submit_page_to_canvas"]) if (!discovery.tools.some((tool) => tool.name === required)) throw new Error(`MasterGo MCP 缺少必需工具：${required}`);
    let pending = false;
    for (const screen of data.screens) {
      const prior = resumablePages.get(screen.id);
      if (options.resume && prior && ["PASS", "PENDING_VERIFICATION", "VERIFIED"].includes(String(prior.status))) {
        (result.pages as unknown[]).push({ ...prior, resumedAction: "SKIPPED_ALREADY_SUBMITTED" });
        pending ||= prior.status === "PENDING_VERIFICATION";
        await persist();
        continue;
      }
      const pageResult: Record<string, unknown> = { screenId: screen.id, screenName: screen.name, placement: canvasLayout.find((item) => item.screenId === screen.id), status: "FAIL", stage: "design_page" };
      (result.pages as unknown[]).push(pageResult);
      await persist();
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
      await persist();
    }
    Object.assign(result, { status: pending ? "PENDING_VERIFICATION" : "PASS", server: info, verificationRequired: pending });
  } catch (error) {
    (result.errors as string[]).push(error instanceof Error ? error.message : String(error));
  } finally {
    result.completedAt = now().toISOString();
    await persist();
    await connection.close().catch(() => undefined);
  }
  return { planPath, resultPath, status: result.status as MasterGoPagePipelineOutput["status"] };
}
