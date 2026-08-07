import { B2B_RULES } from "../knowledge/catalog.js";
import { KnowledgeComplianceValidator } from "../knowledge/compliance-validator.js";
import type {
  PrototypeDsl,
  StageExecutor,
  StageId,
  StageResult,
  WorkflowContext,
} from "../domain/types.js";

const md = (title: string, body: string) => `# ${title}\n\n${body.trim()}\n`;

function buildDerivedNote(derived: boolean, sectionName: string, sourceLabel: string = "根据需求正文推导"): string {
  if (!derived) return "";
  return `\n> *来源：${sourceLabel}（未在${sectionName}章节显式定义）*`;
}

interface ParsedRole {
  name: string;
  description: string;
  original: string;
}

interface ParsedRequirement {
  title: string;
  roles: ParsedRole[];
  coreRequirements: string[];
  states: string[];
  pages: string[];
  excludedScope: string[];
  rolesAreDerived: boolean;
  statesAreDerived: boolean;
  pagesAreDerived: boolean;
  excludedScopeAreDerived: boolean;
}

function parseRequirement(content: string): ParsedRequirement {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "未命名需求";

  const rolesMatch = content.match(/^##\s*(用户角色|用户)\s*\n((?:-\s+.+\n?)+)/m);
  let roles: ParsedRole[];
  let rolesAreDerived: boolean;
  
  if (rolesMatch) {
    roles = rolesMatch[2].trim().split("\n").map(line => {
      const original = line.replace(/^-\s*/, "").trim();
      const colonIndex = original.search(/[：:]/);
      if (colonIndex !== -1) {
        return {
          name: original.substring(0, colonIndex).trim(),
          description: original.substring(colonIndex + 1).trim(),
          original
        };
      }
      return { name: original, description: "", original };
    }).filter(r => r.name);
    rolesAreDerived = false;
  } else {
    roles = [{ name: "员工", description: "", original: "员工" }, { name: "审批人", description: "", original: "审批人" }];
    rolesAreDerived = true;
  }

  const coreReqMatch = content.match(/^##\s*核心需求\s*\n((?:\d+\.\s+.+\n?)+)/m);
  const coreRequirements = coreReqMatch ? coreReqMatch[1].trim().split("\n").map(line => line.replace(/^\d+\.\s*/, "").trim()).filter(Boolean) : [];

  const statesMatch = content.match(/^##\s*(主要状态|状态)\s*\n((?:-\s+.+\n?)+)/m);
  let states: string[];
  let statesAreDerived: boolean;
  
  if (statesMatch) {
    states = statesMatch[2].trim().split("\n").map(line => line.replace(/^-\s*/, "").trim()).filter(Boolean);
    statesAreDerived = false;
  } else {
    states = ["草稿", "审批中", "已通过", "已驳回"];
    statesAreDerived = true;
  }

  const pagesMatch = content.match(/^##\s*(主要页面|页面)\s*\n((?:-\s+.+\n?)+)/m);
  let pages: string[];
  let pagesAreDerived: boolean;
  
  if (pagesMatch) {
    pages = pagesMatch[2].trim().split("\n").map(line => line.replace(/^-\s*/, "").trim()).filter(Boolean);
    pagesAreDerived = false;
  } else {
    pages = ["申请列表", "新建申请", "申请详情", "待办列表", "审批详情", "类型管理"];
    pagesAreDerived = true;
  }

  const excludedMatch = content.match(/^##\s*(暂不考虑范围|非目标)\s*\n((?:-\s+.+\n?)+)/m);
  let excludedScope: string[];
  let excludedScopeAreDerived: boolean;
  
  if (excludedMatch) {
    excludedScope = excludedMatch[2].trim().split("\n").map(line => line.replace(/^-\s*/, "").trim()).filter(Boolean);
    excludedScopeAreDerived = false;
  } else {
    excludedScope = ["数据迁移脚本", "基础信息维护", "外部系统集成"];
    excludedScopeAreDerived = true;
  }

  return { title, roles, coreRequirements, states, pages, excludedScope, rolesAreDerived, statesAreDerived, pagesAreDerived, excludedScopeAreDerived };
}

function generatePageId(name: string, index: number): string {
  const cleaned = name.toLowerCase().replace(/[\s\/\-]/g, "-").replace(/[^\w\u4e00-\u9fa5\-]/g, "");
  if (cleaned) return cleaned;
  return `page-${index}`;
}

function createPrototype(context: Readonly<WorkflowContext>): PrototypeDsl {
  const parsed = parseRequirement(context.input.content);
  const title = parsed.title;
  const actionRoles = parsed.roles.map((role) => role.name);
  if (actionRoles.length === 0) actionRoles.push("管理员");

  const navLabels = new Set<string>();
  const pageIdToNavLabel = new Map<string, string>();

  const pageList: PrototypeDsl["pages"] = [];
  const pageNames = parsed.pages.length > 0 ? parsed.pages : ["申请列表", "新建申请", "申请详情", "待办列表", "审批详情", "类型管理"];

  for (const [index, pageName] of pageNames.entries()) {
    const pageId = generatePageId(pageName, index);
    let pattern: "list" | "form" | "detail" = "list";
    
    if (pageName.includes("新建") || pageName.includes("编辑")) {
      pattern = "form";
    } else if (pageName.includes("详情")) {
      pattern = "detail";
    }

    let navLabel = "申请管理";
    if (pageName.includes("审批")) {
      navLabel = "审批工作台";
      navLabels.add(navLabel);
    } else if (pageName.includes("管理") || pageName.includes("设置")) {
      navLabel = "基础设置";
      navLabels.add(navLabel);
    } else {
      navLabel = "申请管理";
      navLabels.add(navLabel);
    }
    pageIdToNavLabel.set(pageId, navLabel);

    const fields = pattern === "form" 
      ? [
          { id: "type", label: "申请类型", type: "select" as const, required: true },
          { id: "reason", label: "申请理由", type: "textarea" as const, required: true },
        ]
      : [
          { id: "requestNo", label: "申请编号", type: "text" as const, required: false },
          { id: "applicant", label: "申请人", type: "text" as const, required: false },
          { id: "status", label: "状态", type: "select" as const, required: false },
        ];

    const actions = pattern === "form"
      ? [
          { id: "submit", label: "提交", kind: "primary" as const, roles: actionRoles },
          { id: "save-draft", label: "保存草稿", kind: "secondary" as const, roles: actionRoles },
          { id: "cancel", label: "取消", kind: "secondary" as const, roles: actionRoles },
        ]
      : pattern === "detail"
      ? [
          { id: "withdraw", label: "撤回", kind: "danger" as const, confirmation: true, confirmationMessage: "撤回后当前流程将终止，请确认业务影响。", roles: actionRoles },
        ]
      : [
          { id: "search", label: "查询", kind: "primary" as const, roles: actionRoles },
          { id: "reset", label: "重置", kind: "secondary" as const, roles: actionRoles },
          { id: "create", label: "新建", kind: "primary" as const, roles: actionRoles },
          { id: "view", label: "查看", kind: "secondary" as const, roles: actionRoles },
        ];

    pageList.push({
      id: pageId,
      name: pageName,
      route: `/${pageId}`,
      pattern,
      fields,
      actions,
      ...(pattern === "list" ? {
        tableColumns: fields.map((field) => field.id),
        pagination: { enabled: true, pageSize: 20 },
        emptyState: { description: "暂无数据，请调整查询条件或新建记录。", actionId: "create" },
      } : {}),
    });
  }

  const navigation = Array.from(navLabels).map(label => ({
    label,
    pageId: pageList.find(p => pageIdToNavLabel.get(p.id) === label)?.id || pageList[0].id,
    roles: parsed.roles.map(r => r.name),
  }));

  const transitions: PrototypeDsl["transitions"] = [];
  const listPage = pageList.find(p => p.pattern === "list");
  const formPage = pageList.find(p => p.pattern === "form");
  const detailPage = pageList.find(p => p.pattern === "detail");

  if (listPage && formPage) {
    transitions.push(
      { sourcePageId: listPage.id, triggerType: "action", triggerId: "create", triggerLabel: "新建", targetPageId: formPage.id },
    );
  }
  if (listPage && detailPage) {
    transitions.push(
      { sourcePageId: listPage.id, triggerType: "action", triggerId: "view", triggerLabel: "查看", targetPageId: detailPage.id },
    );
  }
  if (formPage && listPage) {
    transitions.push(
      { sourcePageId: formPage.id, triggerType: "action", triggerId: "submit", triggerLabel: "提交", targetPageId: listPage.id },
      { sourcePageId: formPage.id, triggerType: "action", triggerId: "cancel", triggerLabel: "取消", targetPageId: listPage.id },
    );
  }
  if (detailPage && listPage) {
    transitions.push(
      { sourcePageId: detailPage.id, triggerType: "action", triggerId: "withdraw", triggerLabel: "撤回", targetPageId: listPage.id },
    );
  }

  return {
    schemaVersion: "0.2",
    product: {
      name: title,
      description: `依据"${title}"原始需求生成的 B 端产品原型模型。`,
      sourceAttribution: parsed.pagesAreDerived ? "主要页面来源于系统通用推导（未在主要页面章节显式定义）" : undefined,
    },
    navigation,
    pages: pageList,
    rules: [
      { id: "reject-comment-required", description: "驳回时审批意见必填。", appliesTo: ["reject"] },
      { id: "withdraw-pending-only", description: "仅待审批申请允许撤回。", appliesTo: ["withdraw"] },
    ],
    transitions,
    designTokens: {
      colors: {
        primary: "#3B82F6",
        success: "#10B981",
        danger: "#EF4444",
        warning: "#F59E0B",
        bgPage: "#F6F7FB",
        bgCard: "#FFFFFF",
        textPrimary: "#111827",
        textSecondary: "#6B7280",
        border: "#E5E7EB",
      },
      spacing: {
        s8: 8,
        s12: 12,
        s16: 16,
        s20: 20,
        s24: 24,
        s32: 32,
        s40: 40,
      },
      radius: {
        r8: 8,
        r12: 12,
        r16: 16,
        r24: 24,
      },
      typography: {
        fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 28 },
        fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
        lineHeight: { xs: 16, sm: 20, md: 24, lg: 28, xl: 32, xxl: 36 },
      },
    },
  };
}

interface ReviewIssue {
  type: string;
  location: string;
  severity: "error" | "warning";
  relatedRequirement: string;
  suggestion: string;
}

import type { MasterGoData, MasterGoResult } from "../domain/types.js";

export function runReviewChecks(
  prototype: PrototypeDsl,
  mastergo?: { data: MasterGoData; result?: MasterGoResult },
  confirmation?: { status: "pending" | "confirmed" | "rejected" },
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const pageIds = prototype.pages.map((p) => p.id);
  const pageNames = prototype.pages.map((p) => p.name);
  const navLabels = prototype.navigation.map((n) => n.label);

  // 检查 1: 详情页面是否定义了必要字段
  const detailPages = prototype.pages.filter((p) => p.pattern === "detail");
  for (const page of detailPages) {
    if (page.fields.length === 0) {
      issues.push({
        type: "详情页字段缺失",
        location: `页面：${page.name}（${page.id}）`,
        severity: "error",
        relatedRequirement: "详情页需要展示完整信息",
        suggestion: `为 ${page.name} 添加必要的展示字段`,
      });
    }
  }

  // 检查 2: 导航是否覆盖全部核心模块
  if (navLabels.length === 0) {
    issues.push({
      type: "导航缺失",
      location: `Prototype DSL navigation`,
      severity: "error",
      relatedRequirement: "用户需要访问全部核心模块",
      suggestion: "在导航中添加核心模块",
    });
  }

  // 检查 3: 状态字段是否存在
  const hasStatusField = prototype.pages.some((page) =>
    page.fields.some((field) => field.id === "status")
  );
  if (!hasStatusField) {
    issues.push({
      type: "状态字段缺失",
      location: `Prototype DSL pages fields`,
      severity: "error",
      relatedRequirement: "流程型业务需要展示状态",
      suggestion: "在列表页或详情页中添加状态字段",
    });
  }

  // 检查 4: 页面数量是否合理
  if (prototype.pages.length === 0) {
    issues.push({
      type: "页面数量为零",
      location: `Prototype DSL pages`,
      severity: "error",
      relatedRequirement: "至少需要一个页面",
      suggestion: "添加必要的页面",
    });
  }

  // 检查 5: MasterGo 原型生成状态
  if (!mastergo || !mastergo.data) {
    issues.push({
      type: "MasterGo 原型数据缺失",
      location: `mastergo-data.json`,
      severity: "error",
      relatedRequirement: "MasterGo 原型必须基于 Prototype DSL 生成",
      suggestion: "执行 mastergo 阶段生成 mastergo-data.json",
    });
  } else {
    // 检查 6: MasterGo 屏幕数量与 DSL 页面数量一致
    const screenIds = mastergo.data.screens.map((s) => s.id);
    if (mastergo.data.screens.length !== prototype.pages.length) {
      issues.push({
        type: "MasterGo 屏幕数量不一致",
        location: `mastergo-data.json screens（${mastergo.data.screens.length} 个）vs DSL pages（${prototype.pages.length} 个）`,
        severity: "error",
        relatedRequirement: "MasterGo 原型必须覆盖所有 DSL 页面",
        suggestion: `检查是否遗漏页面：${pageIds.filter((id) => !screenIds.includes(id)).join("、")}`,
      });
    }

    // 检查 7: MasterGo 交互与 DSL 跳转一致
    for (const page of prototype.pages) {
      const dslTransitions = prototype.transitions.filter((t) => t.sourcePageId === page.id);
      const mgScreen = mastergo.data.screens.find((s) => s.id === page.id);
      if (mgScreen && dslTransitions.length !== mgScreen.interactions.length) {
        issues.push({
          type: "MasterGo 交互数量不一致",
          location: `页面：${page.name}（${page.id}）`,
          severity: "warning",
          relatedRequirement: "MasterGo 交互必须与 DSL 跳转定义一致",
          suggestion: `检查交互定义，DSL 有 ${dslTransitions.length} 个跳转，MasterGo 有 ${mgScreen.interactions.length} 个`,
        });
      }
    }
  }

  // 检查 8: 原型确认状态
  if (!confirmation || confirmation.status !== "confirmed") {
    issues.push({
      type: "原型未确认",
      location: `prototype-confirmation.json`,
      severity: "error",
      relatedRequirement: "PRD 必须在原型确认后生成",
      suggestion: "完成原型确认后再进入 PRD 阶段",
    });
  }

  // 检查 9: 过渡定义完整性
  if (!prototype.transitions || prototype.transitions.length === 0) {
    issues.push({
      type: "页面过渡定义缺失",
      location: `Prototype DSL transitions`,
      severity: "warning",
      relatedRequirement: "页面之间需要定义跳转关系",
      suggestion: "为各页面添加 transitions 定义",
    });
  }

  return issues;
}

export class MockStageExecutor implements StageExecutor {
  async execute(stage: StageId, context: Readonly<WorkflowContext>): Promise<StageResult> {
    const parsed = parseRequirement(context.input.content);
    const title = parsed.title;
    let artifact: StageResult["artifact"];

    switch (stage) {
      case "requirement-analysis": {
        const rolesText = parsed.roles.length > 0
          ? parsed.roles.map(role => `- ${role.original}`).join("\n")
          : "- 员工\n- 审批人";
        const rolesDerivedNote = buildDerivedNote(parsed.rolesAreDerived, "用户角色");
        const coreReqText = parsed.coreRequirements.length > 0
          ? parsed.coreRequirements.map((req, idx) => `${idx + 1}. ${req}`).join("\n")
          : "1. 用户可以创建申请并提交审批。";
        const excludedText = parsed.excludedScope.length > 0
          ? parsed.excludedScope.map(item => `- ${item}`).join("\n")
          : "- 外部系统集成";
        const excludedDerivedNote = buildDerivedNote(parsed.excludedScopeAreDerived, "暂不考虑范围", "系统默认非目标项");
        artifact = md("需求分析", `## 产品目标\n\n围绕"${title}"建立可追踪、可校验的核心业务闭环。\n\n## 用户与任务\n\n${rolesText}${rolesDerivedNote}\n\n## MVP 范围\n\n${coreReqText}\n\n## 非目标\n\n${excludedText}${excludedDerivedNote}`);
        break;
      }
      case "product-outline": {
        const statesText = parsed.states.length > 0 ? parsed.states.join(" → ") : "草稿 → 审批中 → 已通过 / 已驳回";
        const statesDerivedNote = buildDerivedNote(parsed.statesAreDerived, "主要状态");
        const modulesDerivedNote = buildDerivedNote(true, "用户输入", "系统通用推导，待用户确认");
        artifact = md("产品概要设计", `## 产品定位\n\n${title}是一套面向企业内部流程管理的 B 端产品能力。\n\n## 业务边界\n\n系统负责申请数据、状态流转与操作留痕。\n\n## 核心模块\n\n1. 申请管理\n2. 审批工作台\n3. 基础设置${modulesDerivedNote}\n\n## 核心状态\n\n${statesText}${statesDerivedNote}`);
        break;
      }
      case "product-architecture": {
        const roleNames = parsed.roles.map(r => r.name);
        const roleEndpoints = roleNames.slice(0, 3).map((role, idx) => {
          const endpointId = String.fromCharCode(69 + idx);
          return `U --> ${endpointId}[${role}]`;
        }).join("\n  ");

        const modules: Record<string, string[]> = {};
        parsed.pages.forEach(page => {
          let module = "业务功能";
          if (page.includes("审批") || page.includes("审核")) module = "审批/审核";
          else if (page.includes("管理") || page.includes("设置")) module = "管理设置";
          else if (page.includes("列表") || page.includes("查询")) module = "数据查询";
          else if (page.includes("新建") || page.includes("申请")) module = "申请提交";
          if (!modules[module]) modules[module] = [];
          modules[module].push(page);
        });

        const moduleNodes = Object.entries(modules).map(([module, pages], idx) => {
          const nodeId = `M${idx + 1}`;
          const pagesText = pages.join(", ");
          return `${nodeId}[${module}：${pagesText}]`;
        }).join("\n  ");

        const endpointToModule = roleNames.slice(0, 3).flatMap((role, roleIdx) => {
          const endpointId = String.fromCharCode(69 + roleIdx);
          const moduleKeys = Object.keys(modules);
          if (roleIdx === 0) return moduleKeys.filter(m => m.includes("申请") || m.includes("查询")).map((_, midx) => `${endpointId} --> M${midx + 1}`);
          if (roleIdx === 1) return moduleKeys.filter(m => m.includes("审批")).map((_, midx) => `${endpointId} --> M${midx + 1}`);
          return moduleKeys.filter(m => m.includes("管理")).map((_, midx) => `${endpointId} --> M${midx + 1}`);
        }).join("\n  ");

        const moduleToData = Object.keys(modules).map((_, idx) => `M${idx + 1} --> D`).join("\n  ");

        const pagesDerivedNote = buildDerivedNote(parsed.pagesAreDerived, "主要页面");
        artifact = md("产品架构图", `\`\`\`mermaid
flowchart TB
  U[用户层]
  ${roleEndpoints}
  ${moduleNodes}
  ${endpointToModule}
  ${moduleToData}
  D[(业务数据)]
\`\`\`${pagesDerivedNote}`);
        break;
      }
      case "core-flow": {
        const states = parsed.states.length > 0 ? parsed.states : ["草稿", "审批中", "已通过", "已驳回"];
        const firstState = states[0];
        const middleState = states.find(s => s.includes("审批") || s.includes("处理")) || states[1] || "审批中";
        const approvedState = states.find(s => s.includes("通过") || s.includes("完成")) || "已通过";
        const rejectedState = states.find(s => s.includes("驳回") || s.includes("拒绝")) || "已驳回";
        const statesDerivedNote = buildDerivedNote(parsed.statesAreDerived, "主要状态");
        artifact = md("核心业务流程图", `\`\`\`mermaid\nflowchart LR\n  A[填写申请] --> B{校验通过?}\n  B -- 否 --> A\n  B -- 是 --> C[提交审批]\n  C --> D[${middleState}]\n  D --> E{审批决定}\n  E -- 通过 --> F[${approvedState}]\n  E -- 驳回 --> G[${rejectedState}]\n  D --> H[撤回]\n  H --> I[${firstState}]\n\`\`\`${statesDerivedNote}`);
        break;
      }
      case "page-structure": {
        const pagesByModule: Record<string, string[]> = {};
        parsed.pages.forEach(page => {
          let module: string;
          if (page.includes("审批")) module = "审批工作台";
          else if (page.includes("审核")) module = "审核工作台";
          else if (page.includes("管理") || page.includes("设置")) module = "基础设置";
          else if (page.includes("列表") || page.includes("查询")) module = "数据查询";
          else if (page.includes("新建") || page.includes("创建")) module = "申请提交";
          else if (page.includes("详情")) module = "详情查看";
          else if (page.includes("日历")) module = "日历视图";
          else if (page.includes("待办")) module = "待办处理";
          else module = "其他业务功能";
          if (!pagesByModule[module]) pagesByModule[module] = [];
          pagesByModule[module].push(page);
        });
        const infoArch = Object.entries(pagesByModule).map(([module, pages]) => {
          return `- ${module}\n  ${pages.map(p => `- ${p}`).join("\n  ")}`;
        }).join("\n");
        const pagesDerivedNote = buildDerivedNote(parsed.pagesAreDerived, "主要页面");
        artifact = md("页面结构设计", `## 信息架构\n\n${infoArch}${pagesDerivedNote}\n\n## 页面模式\n\n列表页负责检索与进入业务；表单页负责创建；详情页承载状态、业务数据与可用操作。`);
        break;
      }
      case "prototype":
        artifact = createPrototype(context);
        break;
      case "mastergo": {
        const prototype = context.artifacts.prototype;
        if (!prototype) throw new Error("MasterGo 阶段必须依赖 Prototype DSL");
        const screens = prototype.pages.map((page) => ({
          id: page.id,
          name: page.name,
          route: page.route,
          pattern: page.pattern,
          frame: { width: 1440, height: 900 },
          nodes: [
            ...page.fields.map((field) => ({
              id: field.id,
              name: field.label,
              type: "field" as const,
              component: field.type === "textarea" ? "TextArea" : field.type === "select" ? "Select" : field.type === "datetime" ? "DateTimePicker" : "Input",
              description: `${field.label}${field.required ? "（必填）" : ""}`,
              required: field.required,
            })),
            ...page.actions.map((action) => ({
              id: action.id,
              name: action.label,
              type: "action" as const,
              component: "Button",
              description: `${action.label}按钮`,
            })),
          ],
          interactions: prototype.transitions.filter((t) => t.sourcePageId === page.id),
        }));
        artifact = {
          data: {
            schemaVersion: "0.2",
            product: prototype.product,
            tokens: {
              color: prototype.designTokens.colors,
              spacing: prototype.designTokens.spacing,
              radius: prototype.designTokens.radius,
            },
            screens,
          },
          result: {
            schemaVersion: "0.2",
            createdPages: screens.map((screen) => ({
              pageId: screen.id,
              pageName: screen.name,
              nodeId: `mg-${screen.id}`,
            })),
            createdAt: new Date().toISOString(),
            status: "pending",
          },
        };
        break;
      }
      case "prototype-confirmation": {
        artifact = {
          status: "confirmed",
          confirmedAt: new Date().toISOString(),
          confirmedBy: "System (Mock)",
          comments: ["Mock 环境自动确认", "MasterGo 原型已生成"],
        };
        break;
      }
      case "prd": {
        const prototype = context.artifacts.prototype;
        const mastergo = context.artifacts.mastergo;
        const confirmation = context.artifacts["prototype-confirmation"];
        if (!prototype) throw new Error("PRD 阶段必须依赖 Prototype DSL");
        if (!mastergo) throw new Error("PRD 阶段必须依赖 MasterGo 原型");
        if (!confirmation || confirmation.status !== "confirmed") {
          throw new Error("PRD 阶段必须在原型确认后执行");
        }
        const pages = prototype.pages.map((page) => `### ${page.name}\n\n- 路由：\`${page.route}\`\n- 页面模式：${page.pattern}\n- 字段：${page.fields.map((field) => `${field.label}${field.required ? "（必填）" : ""}`).join("、") || "无"}\n- 操作：${page.actions.map((action) => action.label).join("、")}`).join("\n\n");
        const rules = prototype.rules.map((rule, index) => `${index + 1}. ${rule.description}`).join("\n");
        const pagesDerivedNote = buildDerivedNote(parsed.pagesAreDerived, "主要页面");
        artifact = md("产品需求文档（PRD）", `> 本文档由 Prototype DSL 和 MasterGo 原型派生，原型模型为产品定义的单一事实来源。\n> 原型目录约定为 \`06-prototype/\`，MasterGo 原型目录为 \`07-mastergo/\`。\n\n## 产品目标\n\n${prototype.product.description}\n\n## 页面需求\n\n${pages}${pagesDerivedNote}\n\n## 业务规则\n\n${rules}`);
        break;
      }
      case "review": {
        const prototype = context.artifacts.prototype;
        const mastergo = context.artifacts.mastergo;
        const confirmation = context.artifacts["prototype-confirmation"];
        if (!prototype) throw new Error("Review 阶段必须依赖 Prototype DSL");
        const issues = runReviewChecks(prototype, mastergo, confirmation);
        const complianceMatrix = context.knowledgeCompliance
          ? new KnowledgeComplianceValidator().formatMatrix(context.knowledgeCompliance)
          : "未启用知识合规校验。";
        const conclusion = issues.length === 0
          ? "通过全部自动检查，可进入人工评审。"
          : `发现 ${issues.length} 个问题，请修复后再进入人工评审。`;
        const issuesBody = issues.length === 0
          ? "无"
          : issues.map((issue, idx) => `### 问题 ${idx + 1}\n\n- **问题类型**：${issue.type}\n- **问题位置**：${issue.location}\n- **严重程度**：${issue.severity === "error" ? "错误" : "警告"}\n- **对应原始需求**：${issue.relatedRequirement}\n- **修复建议**：${issue.suggestion}`).join("\n\n");
        artifact = md("设计评审", `## 结论\n\n${conclusion}\n\n## 自动检查发现的问题\n\n${issuesBody}\n\n## 知识合规矩阵\n\n${complianceMatrix}\n\n## 已检查规则\n\n${B2B_RULES.map((rule) => `- ${rule.name}：${rule.description}`).join("\n")}\n\n## 人工评审项\n\n- 角色权限是否符合实际组织规则。\n- 审批状态与异常分支是否完整。\n- Prototype DSL、MasterGo 原型与 PRD 是否一致。\n- MasterGo 交互与 DSL 跳转是否一致。`);
        break;
      }
    }

    return { stage, artifact, warnings: [] };
  }
}
