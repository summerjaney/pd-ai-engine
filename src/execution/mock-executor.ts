import { B2B_RULES } from "../knowledge/catalog.js";
import type {
  PrototypeDsl,
  StageExecutor,
  StageId,
  StageResult,
  WorkflowContext,
} from "../domain/types.js";

const md = (title: string, body: string) => `# ${title}\n\n${body.trim()}\n`;

function createPrototype(context: Readonly<WorkflowContext>): PrototypeDsl {
  return {
    schemaVersion: "0.1",
    product: {
      name: context.input.title,
      description: "依据原始需求生成的 B 端产品原型模型。",
    },
    navigation: [
      { label: "申请管理", pageId: "request-list" },
      { label: "新建申请", pageId: "request-create" },
    ],
    pages: [
      {
        id: "request-list",
        name: "申请列表",
        route: "/requests",
        pattern: "list",
        fields: [
          { id: "type", label: "请假类型", type: "select", required: false },
          { id: "status", label: "审批状态", type: "select", required: false },
        ],
        actions: [
          { id: "create", label: "新建申请", kind: "primary" },
          { id: "view", label: "查看", kind: "secondary" },
          { id: "withdraw", label: "撤回", kind: "danger" },
        ],
      },
      {
        id: "request-create",
        name: "新建申请",
        route: "/requests/new",
        pattern: "form",
        fields: [
          { id: "type", label: "请假类型", type: "select", required: true },
          { id: "startAt", label: "开始时间", type: "datetime", required: true },
          { id: "endAt", label: "结束时间", type: "datetime", required: true },
          { id: "reason", label: "请假原因", type: "textarea", required: true },
        ],
        actions: [
          { id: "submit", label: "提交", kind: "primary" },
          { id: "cancel", label: "取消", kind: "secondary" },
        ],
      },
      {
        id: "request-detail",
        name: "申请详情",
        route: "/requests/:id",
        pattern: "detail",
        fields: [],
        actions: [
          { id: "approve", label: "通过", kind: "primary" },
          { id: "reject", label: "驳回", kind: "danger" },
        ],
      },
    ],
    rules: [
      { id: "start-before-end", description: "开始时间必须早于结束时间。", appliesTo: ["startAt", "endAt"] },
      { id: "reject-comment-required", description: "驳回时审批意见必填。", appliesTo: ["reject"] },
      { id: "withdraw-pending-only", description: "仅待审批申请允许撤回。", appliesTo: ["withdraw"] },
    ],
  };
}

export class MockStageExecutor implements StageExecutor {
  async execute(stage: StageId, context: Readonly<WorkflowContext>): Promise<StageResult> {
    const title = context.input.title;
    let artifact: string | PrototypeDsl;

    switch (stage) {
      case "requirement-analysis":
        artifact = md("需求分析", `## 产品目标\n\n围绕“${title}”建立可追踪、可校验的核心业务闭环。\n\n## 用户与任务\n\n- 业务发起人：创建并跟踪申请。\n- 业务审批人：处理待办并记录审批意见。\n- 业务管理员：维护基础数据并查看全局业务。\n\n## MVP 范围\n\n覆盖创建、提交、审批、驳回、查看进度和条件撤回。\n\n## 非目标\n\n以原始需求中的“暂不考虑”项为准，本轮不扩展外部集成和复杂审批。`);
        break;
      case "product-outline":
        artifact = md("产品概要设计", `## 产品定位\n\n${title}是一套面向企业内部流程管理的 B 端产品能力。\n\n## 业务边界\n\n系统负责申请数据、状态流转与操作留痕；不负责薪资和考勤核算。\n\n## 核心模块\n\n1. 申请管理\n2. 审批工作台\n3. 基础设置\n\n## 核心状态\n\n草稿 → 待审批 → 已通过 / 已驳回；待审批可撤回。`);
        break;
      case "product-architecture":
        artifact = md("产品架构图", "```mermaid\nflowchart TB\n  U[用户层] --> E[员工端]\n  U --> A[审批端]\n  U --> H[人事管理端]\n  E --> R[申请管理]\n  A --> W[审批工作台]\n  H --> S[基础设置]\n  R --> D[(业务数据)]\n  W --> D\n  S --> D\n```");
        break;
      case "core-flow":
        artifact = md("核心业务流程图", "```mermaid\nflowchart LR\n  A[填写申请] --> B{校验通过?}\n  B -- 否 --> A\n  B -- 是 --> C[提交审批]\n  C --> D{审批决定}\n  D -- 通过 --> E[已通过]\n  D -- 驳回 --> F[已驳回]\n  C --> G[撤回]\n```");
        break;
      case "page-structure":
        artifact = md("页面结构设计", `## 信息架构\n\n- 申请管理\n  - 申请列表\n  - 新建申请\n  - 申请详情\n- 审批工作台\n  - 待办列表\n  - 审批详情\n- 基础设置\n  - 请假类型\n\n## 页面模式\n\n列表页负责检索与进入业务；表单页负责创建；详情页承载状态、业务数据与可用操作。`);
        break;
      case "prototype":
        artifact = createPrototype(context);
        break;
      case "prd": {
        const prototype = context.artifacts.prototype;
        if (!prototype) throw new Error("PRD 阶段必须依赖 Prototype DSL");
        const pages = prototype.pages.map((page) => `### ${page.name}\n\n- 路由：\`${page.route}\`\n- 页面模式：${page.pattern}\n- 字段：${page.fields.map((field) => `${field.label}${field.required ? "（必填）" : ""}`).join("、") || "无"}\n- 操作：${page.actions.map((action) => action.label).join("、")}`).join("\n\n");
        const rules = prototype.rules.map((rule, index) => `${index + 1}. ${rule.description}`).join("\n");
        artifact = md("产品需求文档（PRD）", `> 本文档由 Prototype DSL 派生，原型模型为产品定义的单一事实来源。\n\n## 产品目标\n\n${prototype.product.description}\n\n## 页面需求\n\n${pages}\n\n## 业务规则\n\n${rules}`);
        break;
      }
      case "review": {
        const prototype = context.artifacts.prototype;
        if (!prototype) throw new Error("Review 阶段必须依赖 Prototype DSL");
        const hasStatus = prototype.pages.some((page) => page.fields.some((field) => field.id === "status"));
        artifact = md("设计评审", `## 结论\n\n${hasStatus ? "通过基础一致性检查，可进入人工评审。" : "未通过：流程状态未在页面中呈现。"}\n\n## 已检查规则\n\n${B2B_RULES.map((rule) => `- ${rule.name}：${rule.description}`).join("\n")}\n\n## 人工评审项\n\n- 角色权限是否符合实际组织规则。\n- 审批状态与异常分支是否完整。\n- Prototype DSL 与 PRD 是否一致。`);
        break;
      }
    }

    return { stage, artifact, warnings: [] };
  }
}
