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
    schemaVersion: "0.2",
    product: {
      name: context.input.title,
      description: "依据原始需求生成的 B 端产品原型模型。",
    },
    navigation: [
      { label: "申请管理", pageId: "request-list", roles: ["员工", "部门负责人", "人事管理员"] },
      { label: "审批工作台", pageId: "approval-todo", roles: ["部门负责人"] },
      { label: "基础设置", pageId: "leave-type-list", roles: ["人事管理员"] },
    ],
    pages: [
      {
        id: "request-list",
        name: "申请列表",
        route: "/requests",
        pattern: "list",
        fields: [
          { id: "requestNo", label: "申请编号", type: "text", required: false },
          { id: "applicant", label: "申请人", type: "text", required: false },
          { id: "department", label: "所属部门", type: "text", required: false },
          { id: "type", label: "请假类型", type: "select", required: false },
          { id: "startAt", label: "开始时间", type: "datetime", required: false },
          { id: "endAt", label: "结束时间", type: "datetime", required: false },
          { id: "duration", label: "请假时长", type: "text", required: false },
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
          { id: "save-draft", label: "保存草稿", kind: "secondary" },
          { id: "cancel", label: "取消", kind: "secondary" },
        ],
      },
      {
        id: "request-detail",
        name: "申请详情",
        route: "/requests/:id",
        pattern: "detail",
        fields: [
          { id: "requestNo", label: "申请编号", type: "text", required: false },
          { id: "applicant", label: "申请人", type: "text", required: false },
          { id: "department", label: "所属部门", type: "text", required: false },
          { id: "type", label: "请假类型", type: "select", required: false },
          { id: "startAt", label: "开始时间", type: "datetime", required: false },
          { id: "endAt", label: "结束时间", type: "datetime", required: false },
          { id: "duration", label: "请假时长", type: "text", required: false },
          { id: "reason", label: "请假原因", type: "textarea", required: false },
          { id: "status", label: "当前审批状态", type: "select", required: false },
          { id: "approvalHistory", label: "审批记录", type: "textarea", required: false },
        ],
        actions: [
          { id: "withdraw", label: "撤回", kind: "danger" },
        ],
      },
      {
        id: "approval-todo",
        name: "待办列表",
        route: "/approvals",
        pattern: "list",
        fields: [
          { id: "requestNo", label: "申请编号", type: "text", required: false },
          { id: "applicant", label: "申请人", type: "text", required: false },
          { id: "department", label: "所属部门", type: "text", required: false },
          { id: "type", label: "请假类型", type: "select", required: false },
          { id: "startAt", label: "开始时间", type: "datetime", required: false },
          { id: "endAt", label: "结束时间", type: "datetime", required: false },
          { id: "status", label: "审批状态", type: "select", required: false },
        ],
        actions: [
          { id: "view", label: "查看", kind: "secondary" },
          { id: "approve", label: "通过", kind: "primary" },
          { id: "reject", label: "驳回", kind: "danger" },
        ],
      },
      {
        id: "approval-detail",
        name: "审批详情",
        route: "/approvals/:id",
        pattern: "detail",
        fields: [
          { id: "requestNo", label: "申请编号", type: "text", required: false },
          { id: "applicant", label: "申请人", type: "text", required: false },
          { id: "department", label: "所属部门", type: "text", required: false },
          { id: "type", label: "请假类型", type: "select", required: false },
          { id: "startAt", label: "开始时间", type: "datetime", required: false },
          { id: "endAt", label: "结束时间", type: "datetime", required: false },
          { id: "duration", label: "请假时长", type: "text", required: false },
          { id: "reason", label: "请假原因", type: "textarea", required: false },
          { id: "status", label: "当前审批状态", type: "select", required: false },
          { id: "approvalHistory", label: "审批记录", type: "textarea", required: false },
          { id: "comment", label: "审批意见", type: "textarea", required: false },
        ],
        actions: [
          { id: "approve", label: "审批通过", kind: "primary" },
          { id: "reject", label: "审批驳回", kind: "danger" },
        ],
      },
      {
        id: "leave-type-list",
        name: "请假类型管理",
        route: "/settings/leave-types",
        pattern: "list",
        fields: [
          { id: "name", label: "类型名称", type: "text", required: false },
          { id: "enabled", label: "是否启用", type: "select", required: false },
        ],
        actions: [
          { id: "create", label: "新增请假类型", kind: "primary" },
          { id: "edit", label: "编辑", kind: "secondary" },
          { id: "toggle", label: "启用/停用", kind: "secondary" },
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

interface ReviewIssue {
  type: string;
  location: string;
  severity: "error" | "warning";
  relatedRequirement: string;
  suggestion: string;
}

export function runReviewChecks(prototype: PrototypeDsl): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const pageIds = prototype.pages.map((p) => p.id);
  const pageNames = prototype.pages.map((p) => p.name);
  const navLabels = prototype.navigation.map((n) => n.label);

  // 检查 1: 核心模块是否都有对应页面
  const expectedModulePages: Record<string, string[]> = {
    "申请管理": ["request-list", "request-create", "request-detail"],
    "审批工作台": ["approval-todo", "approval-detail"],
    "基础设置": ["leave-type-list"],
  };
  for (const [moduleName, expectedIds] of Object.entries(expectedModulePages)) {
    const missing = expectedIds.filter((id) => !pageIds.includes(id));
    if (missing.length > 0) {
      issues.push({
        type: "核心模块页面缺失",
        location: `Prototype DSL pages（${moduleName}）`,
        severity: "error",
        relatedRequirement: `核心需求：${moduleName}功能`,
        suggestion: `补充以下页面：${missing.join("、")}`,
      });
    }
  }

  // 检查 2: 每个角色的核心操作是否都有可访问页面
  const roleOperations: Record<string, { pageId: string; operation: string }[]> = {
    "员工": [
      { pageId: "request-list", operation: "查看自己的申请" },
      { pageId: "request-create", operation: "创建申请" },
      { pageId: "request-detail", operation: "查看申请详情并撤回" },
    ],
    "部门负责人": [
      { pageId: "approval-todo", operation: "查看待办" },
      { pageId: "approval-detail", operation: "审批申请" },
    ],
    "人事管理员": [
      { pageId: "leave-type-list", operation: "维护请假类型" },
    ],
  };
  for (const [role, operations] of Object.entries(roleOperations)) {
    for (const { pageId, operation } of operations) {
      if (!pageIds.includes(pageId)) {
        issues.push({
          type: "角色操作页面缺失",
          location: `角色：${role}，操作：${operation}`,
          severity: "error",
          relatedRequirement: `原始需求：${role}的核心功能`,
          suggestion: `添加页面 ${pageId} 以支持${operation}`,
        });
      }
    }
  }

  // 检查 3: 页面结构中的页面是否都存在于 Prototype DSL
  const expectedPageIds = [
    "request-list", "request-create", "request-detail",
    "approval-todo", "approval-detail", "leave-type-list",
  ];
  const missingPages = expectedPageIds.filter((id) => !pageIds.includes(id));
  if (missingPages.length > 0) {
    issues.push({
      type: "页面结构缺失",
      location: `Prototype DSL pages`,
      severity: "error",
      relatedRequirement: "页面结构设计阶段定义的页面",
      suggestion: `补充以下页面：${missingPages.join("、")}`,
    });
  }

  // 检查 4: 详情页面是否定义了必要字段
  const detailPages = prototype.pages.filter((p) => p.pattern === "detail");
  for (const page of detailPages) {
    if (page.fields.length === 0) {
      issues.push({
        type: "详情页字段缺失",
        location: `页面：${page.name}（${page.id}）`,
        severity: "error",
        relatedRequirement: "申请详情和审批详情需要展示完整信息",
        suggestion: `为 ${page.name} 添加必要的展示字段，如申请编号、申请人、请假类型、时间等`,
      });
    }
  }

  // 检查 5: 导航是否覆盖全部核心模块
  const expectedNavLabels = ["申请管理", "审批工作台", "基础设置"];
  const missingNav = expectedNavLabels.filter((label) => !navLabels.includes(label));
  if (missingNav.length > 0) {
    issues.push({
      type: "导航缺失",
      location: `Prototype DSL navigation`,
      severity: "error",
      relatedRequirement: "用户需要访问全部核心模块",
      suggestion: `在导航中添加：${missingNav.join("、")}`,
    });
  }

  // 检查 6: PRD 页面是否与 Prototype DSL pages 一致（PRD 由 DSL 派生，这里检查 DSL 完整性）
  if (prototype.pages.length !== expectedPageIds.length) {
    issues.push({
      type: "页面数量不一致",
      location: `Prototype DSL pages（${prototype.pages.length} 个）vs 预期（${expectedPageIds.length} 个）`,
      severity: "warning",
      relatedRequirement: "PRD 必须与 Prototype DSL 保持一致",
      suggestion: "检查是否有遗漏或多余的页面定义",
    });
  }

  // 检查 7: 状态与流程图中的状态是否一致
  const hasStatusField = prototype.pages.some((page) =>
    page.fields.some((field) => field.id === "status")
  );
  if (!hasStatusField) {
    issues.push({
      type: "状态字段缺失",
      location: `Prototype DSL pages fields`,
      severity: "error",
      relatedRequirement: "核心流程图包含待审批、已通过、已驳回等状态",
      suggestion: "在列表页或详情页中添加审批状态字段",
    });
  }

  return issues;
}

export class MockStageExecutor implements StageExecutor {
  async execute(stage: StageId, context: Readonly<WorkflowContext>): Promise<StageResult> {
    const title = context.input.title;
    let artifact: string | PrototypeDsl;

    switch (stage) {
      case "requirement-analysis":
        artifact = md("需求分析", `## 产品目标\n\n围绕"${title}"建立可追踪、可校验的核心业务闭环。\n\n## 用户与任务\n\n- 员工：创建、查看和撤回自己的请假申请。\n- 部门负责人：审批本部门员工的请假申请，记录审批意见。\n- 人事管理员：查看全部申请，维护请假类型。\n\n## MVP 范围\n\n覆盖创建、提交、审批、驳回、查看进度和条件撤回。\n\n## 非目标\n\n以原始需求中的"暂不考虑"项为准，本轮不扩展外部集成和复杂审批。`);
        break;
      case "product-outline":
        artifact = md("产品概要设计", `## 产品定位\n\n${title}是一套面向企业内部流程管理的 B 端产品能力。\n\n## 业务边界\n\n系统负责申请数据、状态流转与操作留痕；不负责薪资和考勤核算。\n\n## 核心模块\n\n1. 申请管理\n2. 审批工作台\n3. 基础设置\n\n## 核心状态\n\n草稿 → 待审批 → 已通过 / 已驳回；待审批可撤回。`);
        break;
      case "product-architecture":
        artifact = md("产品架构图", "```mermaid\nflowchart TB\n  U[用户层] --> E[员工端]\n  U --> A[审批端]\n  U --> H[人事管理端]\n  E --> R[申请管理]\n  A --> W[审批工作台]\n  H --> S[基础设置]\n  R --> D[(业务数据)]\n  W --> D\n  S --> D\n```");
        break;
      case "core-flow":
        artifact = md("核心业务流程图", "```mermaid\nflowchart LR\n  A[填写申请] --> B{校验通过?}\n  B -- 否 --> A\n  B -- 是 --> C[提交审批]\n  C --> D[待审批]\n  D --> E{审批决定}\n  E -- 通过 --> F[已通过]\n  E -- 驳回 --> G[已驳回]\n  D --> H[撤回]\n  H --> I[草稿]\n```");
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
        artifact = md("产品需求文档（PRD）", `> 本文档由 Prototype DSL 派生，原型模型为产品定义的单一事实来源。\n> 原型目录约定为 \`06-prototype/\`，其中 \`prototype.html\` 可用于交互预览，\`mastergo-data.json\` 可用于后续设计工具适配。\n\n## 产品目标\n\n${prototype.product.description}\n\n## 页面需求\n\n${pages}\n\n## 业务规则\n\n${rules}`);
        break;
      }
      case "review": {
        const prototype = context.artifacts.prototype;
        if (!prototype) throw new Error("Review 阶段必须依赖 Prototype DSL");
        const issues = runReviewChecks(prototype);
        const conclusion = issues.length === 0
          ? "通过全部自动检查，可进入人工评审。"
          : `发现 ${issues.length} 个问题，请修复后再进入人工评审。`;
        const issuesBody = issues.length === 0
          ? "无"
          : issues.map((issue, idx) => `### 问题 ${idx + 1}\n\n- **问题类型**：${issue.type}\n- **问题位置**：${issue.location}\n- **严重程度**：${issue.severity === "error" ? "错误" : "警告"}\n- **对应原始需求**：${issue.relatedRequirement}\n- **修复建议**：${issue.suggestion}`).join("\n\n");
        artifact = md("设计评审", `## 结论\n\n${conclusion}\n\n## 自动检查发现的问题\n\n${issuesBody}\n\n## 已检查规则\n\n${B2B_RULES.map((rule) => `- ${rule.name}：${rule.description}`).join("\n")}\n\n## 人工评审项\n\n- 角色权限是否符合实际组织规则。\n- 审批状态与异常分支是否完整。\n- Prototype DSL 与 PRD 是否一致。`);
        break;
      }
    }

    return { stage, artifact, warnings: [] };
  }
}
