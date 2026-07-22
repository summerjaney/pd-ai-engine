import type {
  MasterGoData,
  MasterGoScreenNode,
  PrototypeBundleManifest,
  PrototypeDsl,
  PrototypePage,
  PrototypeTransition,
} from "../domain/types.js";

const PAGE_FRAME = { width: 1440, height: 1024 };

const MODULE_PAGE_IDS: Record<string, string[]> = {
  "申请管理": ["request-list", "request-create", "request-detail"],
  "审批工作台": ["approval-todo", "approval-detail"],
  "基础设置": ["leave-type-list"],
};

const ACTION_TARGETS: Record<string, Record<string, string>> = {
  "request-list": {
    create: "request-create",
    view: "request-detail",
  },
  "request-create": {
    submit: "request-detail",
    "save-draft": "request-detail",
    cancel: "request-list",
  },
  "request-detail": {
    withdraw: "request-list",
  },
  "approval-todo": {
    view: "approval-detail",
    approve: "approval-detail",
    reject: "approval-detail",
  },
  "approval-detail": {
    approve: "approval-todo",
    reject: "approval-todo",
  },
  "leave-type-list": {
    create: "leave-type-list",
    edit: "leave-type-list",
    toggle: "leave-type-list",
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

function pageRoles(prototype: PrototypeDsl, pageId: string): string[] {
  const roles = new Set<string>();
  for (const item of prototype.navigation) {
    if (item.pageId === pageId) {
      for (const role of item.roles ?? []) roles.add(role);
      continue;
    }

    const modulePageIds = MODULE_PAGE_IDS[item.label] ?? [];
    if (modulePageIds.includes(pageId)) {
      for (const role of item.roles ?? []) roles.add(role);
    }
  }

  return [...roles];
}

export function buildPrototypeTransitions(prototype: PrototypeDsl): PrototypeTransition[] {
  const transitions: PrototypeTransition[] = [];

  for (const item of prototype.navigation) {
    transitions.push({
      sourcePageId: "global-navigation",
      triggerType: "navigation",
      triggerId: item.pageId,
      triggerLabel: item.label,
      targetPageId: item.pageId,
    });
  }

  for (const page of prototype.pages) {
    const targets = ACTION_TARGETS[page.id] ?? {};
    for (const action of page.actions) {
      const targetPageId = targets[action.id];
      if (!targetPageId) continue;
      transitions.push({
        sourcePageId: page.id,
        triggerType: "action",
        triggerId: action.id,
        triggerLabel: action.label,
        targetPageId,
      });
    }
  }

  return transitions;
}

export function buildPrototypeManifest(prototype: PrototypeDsl): PrototypeBundleManifest {
  return {
    schemaVersion: "0.2",
    entry: "prototype.html",
    dsl: "prototype.json",
    mastergoData: "mastergo-data.json",
    previewDirectory: "preview",
    navigation: prototype.navigation,
    pages: prototype.pages.map((page) => ({
      id: page.id,
      name: page.name,
      route: page.route,
      pattern: page.pattern,
      roles: pageRoles(prototype, page.id),
      fieldCount: page.fields.length,
      actionCount: page.actions.length,
      preview: `preview/${page.id}.svg`,
    })),
    transitions: buildPrototypeTransitions(prototype),
  };
}

function masterGoNodeForField(page: PrototypePage, fieldIndex: number): MasterGoScreenNode {
  const field = page.fields[fieldIndex];
  const component = field.type === "textarea"
    ? "textarea"
    : field.type === "select"
      ? "select"
      : field.type === "datetime"
        ? "date-time-picker"
        : "text-input";

  return {
    id: `${page.id}.field.${field.id}`,
    name: field.label,
    type: "field",
    component,
    description: `${page.name}中的${field.label}${field.required ? "，必填" : ""}`,
    required: field.required,
  };
}

function masterGoNodeForAction(page: PrototypePage, actionIndex: number): MasterGoScreenNode {
  const action = page.actions[actionIndex];
  return {
    id: `${page.id}.action.${action.id}`,
    name: action.label,
    type: "action",
    component: action.kind === "primary" ? "primary-button" : action.kind === "danger" ? "danger-button" : "secondary-button",
    description: `${page.name}中的${action.label}操作`,
  };
}

export function buildMasterGoData(prototype: PrototypeDsl): MasterGoData {
  const transitions = prototype.transitions.length > 0 ? prototype.transitions : buildPrototypeTransitions(prototype);

  return {
    schemaVersion: "0.2",
    product: prototype.product,
    tokens: {
      color: prototype.designTokens.colors,
      spacing: prototype.designTokens.spacing,
      radius: prototype.designTokens.radius,
    },
    screens: prototype.pages.map((page) => ({
      id: page.id,
      name: page.name,
      route: page.route,
      pattern: page.pattern,
      frame: PAGE_FRAME,
      nodes: [
        {
          id: `${page.id}.section.header`,
          name: "页面头部",
          type: "section",
          component: "page-header",
          description: `${page.name}标题、路由与角色标记`,
        },
        ...page.fields.map((_, index) => masterGoNodeForField(page, index)),
        ...page.actions.map((_, index) => masterGoNodeForAction(page, index)),
      ],
      interactions: transitions.filter((transition) => transition.sourcePageId === page.id),
    })),
  };
}

function renderPageSummaryCard(page: PrototypePage, roles: string[]): string {
  const roleContent = roles.length > 0 ? roles.join(" / ") : "未声明";
  return `
    <article class="summary-card">
      <p class="summary-kicker">${escapeHtml(page.pattern.toUpperCase())}</p>
      <h3>${escapeHtml(page.name)}</h3>
      <p>${escapeHtml(page.route)}</p>
      <p>角色：${escapeHtml(roleContent)}</p>
      <p>字段 ${page.fields.length} 个 · 操作 ${page.actions.length} 个</p>
    </article>
  `;
}

export function renderInteractivePrototypeHtml(
  prototype: PrototypeDsl,
  manifest: PrototypeBundleManifest,
): string {
  const pagesById = Object.fromEntries(prototype.pages.map((page) => [page.id, page]));
  const initialPageId = prototype.navigation[0]?.pageId ?? prototype.pages[0]?.id ?? "";

  const pageSections = prototype.pages.map((page) => {
    const roles = pageRoles(prototype, page.id);
    return `
      <section class="page-panel" data-page-id="${escapeHtml(page.id)}">
        <div class="page-header">
          <div>
            <p class="eyebrow">${escapeHtml(page.pattern.toUpperCase())}</p>
            <h2>${escapeHtml(page.name)}</h2>
            <p class="page-route">${escapeHtml(page.route)}</p>
          </div>
          <div class="role-list">
            ${roles.map((role) => `<span class="role-chip">${escapeHtml(role)}</span>`).join("") || "<span class=\"role-chip\">未声明角色</span>"}
          </div>
        </div>
        <div class="page-grid">
          <article class="panel">
            <h3>字段定义</h3>
            <div class="field-list">
              ${page.fields.map((field) => `
                <div class="field-card">
                  <div class="field-top">
                    <strong>${escapeHtml(field.label)}</strong>
                    <span>${escapeHtml(field.type)}</span>
                  </div>
                  <p>${field.required ? "必填字段" : "选填/展示字段"}</p>
                </div>
              `).join("")}
            </div>
          </article>
          <article class="panel">
            <h3>交互操作</h3>
            <div class="action-list">
              ${page.actions.map((action) => `
                <button type="button" class="action action-${escapeHtml(action.kind)}" data-action-page="${escapeHtml(page.id)}" data-action-id="${escapeHtml(action.id)}">
                  ${escapeHtml(action.label)}
                </button>
              `).join("")}
            </div>
            <h3>业务规则</h3>
            <ul class="rule-list">
              ${prototype.rules.map((rule) => `<li>${escapeHtml(rule.description)}</li>`).join("")}
            </ul>
          </article>
        </div>
      </section>
    `;
  }).join("");

  const summaryCards = prototype.pages
    .map((page) => renderPageSummaryCard(page, pageRoles(prototype, page.id)))
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(prototype.product.name)} - Prototype</title>
    <style>
      :root {
        --bg: linear-gradient(135deg, #f6f0e5 0%, #f5f7ff 55%, #f6fff8 100%);
        --surface: rgba(255, 253, 248, 0.88);
        --surface-strong: #fffdf8;
        --text: #1d1b16;
        --muted: #6c675d;
        --accent: #1f5eff;
        --accent-soft: rgba(31, 94, 255, 0.12);
        --danger: #af3c2d;
        --border: rgba(125, 114, 93, 0.18);
        --shadow: 0 18px 42px rgba(52, 43, 27, 0.12);
        --radius: 24px;
        --radius-sm: 16px;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "IBM Plex Sans", "PingFang SC", "Hiragino Sans GB", sans-serif;
        color: var(--text);
        background: var(--bg);
      }

      .shell {
        width: min(1400px, calc(100vw - 32px));
        margin: 24px auto;
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 20px;
      }

      .sidebar,
      .workspace,
      .summary-card,
      .panel,
      .page-panel {
        backdrop-filter: blur(16px);
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
      }

      .sidebar {
        border-radius: var(--radius);
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        position: sticky;
        top: 24px;
        height: fit-content;
      }

      .sidebar h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
      }

      .sidebar p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .nav-list {
        display: grid;
        gap: 10px;
      }

      .nav-item {
        width: 100%;
        border: 0;
        text-align: left;
        border-radius: 18px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.6);
        color: inherit;
        cursor: pointer;
        transition: transform 140ms ease, background 140ms ease, box-shadow 140ms ease;
      }

      .nav-item:hover,
      .nav-item.active {
        transform: translateY(-1px);
        background: var(--accent-soft);
        box-shadow: inset 0 0 0 1px rgba(31, 94, 255, 0.18);
      }

      .nav-item strong,
      .nav-item span {
        display: block;
      }

      .nav-item span {
        margin-top: 6px;
        color: var(--muted);
        font-size: 13px;
      }

      .workspace {
        border-radius: var(--radius);
        padding: 24px;
      }

      .hero {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: flex-end;
        justify-content: space-between;
      }

      .hero h2,
      .page-header h2,
      .panel h3 {
        margin: 0;
      }

      .hero p {
        margin: 8px 0 0;
        color: var(--muted);
        max-width: 760px;
        line-height: 1.6;
      }

      .badge {
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 13px;
      }

      .summary-grid {
        margin-top: 24px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }

      .summary-card {
        border-radius: 20px;
        padding: 18px;
      }

      .summary-card h3 {
        margin: 8px 0;
      }

      .summary-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .summary-kicker,
      .eyebrow {
        margin: 0 0 6px;
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.12em;
      }

      .page-panel {
        display: none;
        margin-top: 24px;
        border-radius: var(--radius);
        padding: 24px;
      }

      .page-panel.active {
        display: block;
      }

      .page-header {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: space-between;
        align-items: center;
      }

      .page-route {
        margin: 8px 0 0;
        color: var(--muted);
      }

      .role-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .role-chip {
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(29, 27, 22, 0.06);
        color: var(--muted);
        font-size: 13px;
      }

      .page-grid {
        margin-top: 20px;
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
        gap: 16px;
      }

      .panel {
        border-radius: 20px;
        padding: 20px;
      }

      .field-list,
      .action-list {
        display: grid;
        gap: 12px;
      }

      .field-card {
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 16px;
        background: var(--surface-strong);
      }

      .field-card p {
        margin: 8px 0 0;
        color: var(--muted);
      }

      .field-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }

      .field-top span {
        color: var(--muted);
        font-size: 13px;
      }

      .action {
        border: 0;
        border-radius: 16px;
        padding: 14px 16px;
        text-align: left;
        cursor: pointer;
        font: inherit;
        transition: transform 120ms ease;
      }

      .action:hover {
        transform: translateY(-1px);
      }

      .action-primary {
        background: var(--accent);
        color: #fff;
      }

      .action-secondary {
        background: rgba(29, 27, 22, 0.08);
        color: var(--text);
      }

      .action-danger {
        background: rgba(175, 60, 45, 0.12);
        color: var(--danger);
      }

      .rule-list {
        margin: 16px 0 0;
        padding-left: 20px;
        color: var(--muted);
        line-height: 1.6;
      }

      .hint {
        margin-top: 16px;
        color: var(--muted);
        font-size: 13px;
      }

      @media (max-width: 1040px) {
        .shell,
        .page-grid {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div>
          <p class="eyebrow">PROTOTYPE BUNDLE</p>
          <h1>${escapeHtml(prototype.product.name)}</h1>
          <p>${escapeHtml(prototype.product.description)}</p>
        </div>
        <div class="nav-list">
          ${prototype.navigation.map((item) => `
            <button type="button" class="nav-item" data-target-page="${escapeHtml(item.pageId)}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml((pagesById[item.pageId]?.name ?? item.pageId) + ((item.roles?.length ?? 0) > 0 ? ` · ${item.roles?.join("/")}` : ""))}</span>
            </button>
          `).join("")}
        </div>
        <p class="hint">点击左侧模块或页面内按钮，可以在原型页面之间跳转。这是一个可直接打开的单文件 HTML 原型。</p>
      </aside>
      <main class="workspace">
        <section class="hero">
          <div>
            <p class="eyebrow">SINGLE SOURCE OF TRUTH</p>
            <h2>Prototype DSL + 可交互 HTML + MasterGo 适配数据</h2>
            <p>当前目录同时输出 prototype.json、prototype.html、prototype-manifest.json、mastergo-data.json 与 preview/*.svg。直接设计写回 MasterGo 画布仍需要后续插件或写入能力。</p>
          </div>
          <span class="badge">Schema ${escapeHtml(prototype.schemaVersion)}</span>
        </section>
        <section class="summary-grid">
          ${summaryCards}
        </section>
        ${pageSections}
      </main>
    </div>
    <script type="application/json" id="prototype-manifest">${escapeHtml(JSON.stringify(manifest))}</script>
    <script>
      const manifest = JSON.parse(document.getElementById("prototype-manifest").textContent);
      const actionTransitions = new Map(
        manifest.transitions
          .filter((transition) => transition.triggerType === "action")
          .map((transition) => [transition.sourcePageId + ":" + transition.triggerId, transition.targetPageId])
      );
      const navItems = Array.from(document.querySelectorAll(".nav-item"));
      const panels = Array.from(document.querySelectorAll(".page-panel"));

      function showPage(pageId) {
        panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.pageId === pageId));
        navItems.forEach((item) => item.classList.toggle("active", item.dataset.targetPage === pageId));
        history.replaceState(null, "", "#" + pageId);
      }

      navItems.forEach((item) => {
        item.addEventListener("click", () => showPage(item.dataset.targetPage));
      });

      document.querySelectorAll("[data-action-page][data-action-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.actionPage + ":" + button.dataset.actionId;
          const nextPageId = actionTransitions.get(key);
          if (nextPageId) showPage(nextPageId);
        });
      });

      const initial = location.hash.slice(1) || ${JSON.stringify(initialPageId)};
      showPage(initial);
    </script>
  </body>
</html>
`;
}

export function renderPreviewSvg(page: PrototypePage, productName: string): string {
  const width = 960;
  const height = 640;
  const fieldHeight = Math.min(page.fields.length, 6) * 42;
  const actionWidth = Math.max(page.actions.length, 1) * 132;
  const pageType = page.pattern.toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(page.name)} preview">
  <defs>
    <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="#f6f0e5" />
      <stop offset="55%" stop-color="#f4f7ff" />
      <stop offset="100%" stop-color="#eefaf3" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" rx="32" />
  <rect x="48" y="48" width="864" height="544" rx="28" fill="#fffdf8" stroke="#d8d0c2" />
  <text x="84" y="102" fill="#1f5eff" font-family="IBM Plex Sans, PingFang SC, sans-serif" font-size="14" letter-spacing="2">${escapeXml(pageType)}</text>
  <text x="84" y="144" fill="#1d1b16" font-family="IBM Plex Sans, PingFang SC, sans-serif" font-size="34" font-weight="700">${escapeXml(page.name)}</text>
  <text x="84" y="178" fill="#6c675d" font-family="IBM Plex Sans, PingFang SC, sans-serif" font-size="18">${escapeXml(productName)} · ${escapeXml(page.route)}</text>
  <rect x="84" y="218" width="520" height="${Math.max(180, fieldHeight + 44)}" rx="20" fill="#ffffff" stroke="#d8d0c2" />
  <text x="108" y="252" fill="#1d1b16" font-family="IBM Plex Sans, PingFang SC, sans-serif" font-size="20" font-weight="600">字段区</text>
  ${page.fields.slice(0, 6).map((field, index) => `
  <rect x="108" y="${272 + index * 42}" width="472" height="28" rx="14" fill="${field.required ? "#eef3ff" : "#f6f2ea"}" />
  <text x="124" y="${291 + index * 42}" fill="#3f3a31" font-family="IBM Plex Sans, PingFang SC, sans-serif" font-size="14">${escapeXml(field.label)} · ${escapeXml(field.type)}</text>
  `).join("")}
  <rect x="632" y="218" width="232" height="${Math.max(180, actionWidth > 0 ? 56 + Math.ceil(page.actions.length / 1) * 52 : 180)}" rx="20" fill="#ffffff" stroke="#d8d0c2" />
  <text x="656" y="252" fill="#1d1b16" font-family="IBM Plex Sans, PingFang SC, sans-serif" font-size="20" font-weight="600">操作区</text>
  ${page.actions.map((action, index) => `
  <rect x="656" y="${274 + index * 52}" width="184" height="36" rx="18" fill="${action.kind === "primary" ? "#1f5eff" : action.kind === "danger" ? "#fde8e5" : "#f0ede7"}" />
  <text x="${action.kind === "primary" ? 716 : 706}" y="${297 + index * 52}" fill="${action.kind === "primary" ? "#ffffff" : action.kind === "danger" ? "#af3c2d" : "#3f3a31"}" font-family="IBM Plex Sans, PingFang SC, sans-serif" font-size="14">${escapeXml(action.label)}</text>
  `).join("")}
  <text x="84" y="560" fill="#6c675d" font-family="IBM Plex Sans, PingFang SC, sans-serif" font-size="16">Generated preview · fields ${page.fields.length} · actions ${page.actions.length}</text>
</svg>
`;
}
