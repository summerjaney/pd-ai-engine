import {
  PLATFORM_KNOWLEDGE_KINDS,
  PLATFORM_KNOWLEDGE_SOURCE_TYPES,
  PLATFORM_KNOWLEDGE_STATUSES,
  type PlatformKnowledgeCatalogFile,
  type PlatformKnowledgeEntity,
  type PlatformKnowledgeKind,
} from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isSemver = (value: unknown): value is string => isString(value) && /^\d+\.\d+\.\d+$/.test(value);

export class PlatformKnowledgeValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`平台知识库校验失败：\n- ${issues.join("\n- ")}`);
    this.name = "PlatformKnowledgeValidationError";
  }
}

export class PlatformKnowledgeValidator {
  validateCatalog(value: unknown): asserts value is PlatformKnowledgeCatalogFile {
    const issues: string[] = [];
    if (!isObject(value)) issues.push("catalog.json 顶层必须是对象");
    else {
      if (value.schemaVersion !== "1.4") issues.push('catalog.schemaVersion 必须为 "1.4"');
      if (!isSemver(value.version)) issues.push("catalog.version 必须是语义化版本");
      if (!isObject(value.product) || !isString(value.product.id) || !isString(value.product.name) || !isSemver(value.product.version)) {
        issues.push("catalog.product 必须包含 id、name 和语义化 version");
      }
      if (!isStringArray(value.entries)) issues.push("catalog.entries 必须是路径字符串数组");
    }
    if (issues.length) throw new PlatformKnowledgeValidationError(issues);
  }

  validateEntities(values: unknown[]): asserts values is PlatformKnowledgeEntity[] {
    const issues: string[] = [];
    const entities = values.filter(isObject);
    values.forEach((value, index) => this.validateEntity(value, index, issues));

    const ids = new Set<string>();
    for (const entity of entities) {
      if (!isString(entity.id)) continue;
      if (ids.has(entity.id)) issues.push(`平台知识 ID 重复：${entity.id}`);
      ids.add(entity.id);
    }
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    for (const entity of entities) {
      if (!isString(entity.id) || !Array.isArray(entity.references)) continue;
      for (const reference of entity.references) {
        if (!isObject(reference) || !isString(reference.id)) continue;
        const target = byId.get(reference.id);
        if (!target) issues.push(`${entity.id} 引用了不存在的平台知识：${reference.id}`);
        else if (reference.kind !== target.kind) issues.push(`${entity.id} 对 ${reference.id} 的 kind 声明不一致`);
      }
    }
    if (issues.length) throw new PlatformKnowledgeValidationError(issues);
  }

  private validateEntity(value: unknown, index: number, issues: string[]): void {
    const label = `entries[${index}]`;
    if (!isObject(value)) { issues.push(`${label} 必须是对象`); return; }
    for (const field of ["id", "name", "description"] as const) if (!isString(value[field])) issues.push(`${label}.${field} 缺失或为空`);
    if (!PLATFORM_KNOWLEDGE_KINDS.includes(value.kind as PlatformKnowledgeKind)) issues.push(`${label}.kind 非法：${String(value.kind)}`);
    if (!isSemver(value.version)) issues.push(`${label}.version 必须是语义化版本`);
    if (!PLATFORM_KNOWLEDGE_STATUSES.includes(value.status as never)) issues.push(`${label}.status 非法：${String(value.status)}`);
    if (!isStringArray(value.tags)) issues.push(`${label}.tags 必须是字符串数组`);
    if (!isObject(value.source) || !PLATFORM_KNOWLEDGE_SOURCE_TYPES.includes(value.source.type as never) || !isString(value.source.document)) {
      issues.push(`${label}.source 必须包含有效 type 和 document`);
    }
    if (!Array.isArray(value.references)) issues.push(`${label}.references 必须是数组`);
    else value.references.forEach((reference, referenceIndex) => {
      if (!isObject(reference) || !isString(reference.id) || !PLATFORM_KNOWLEDGE_KINDS.includes(reference.kind as PlatformKnowledgeKind)) {
        issues.push(`${label}.references[${referenceIndex}] 必须包含有效 id 和 kind`);
      }
    });

    if (value.kind === "capability") {
      if (!isString(value.domain) || !isString(value.module)) issues.push(`${label} 能力必须包含 domain 和 module`);
      if (value.level !== "platform" && value.level !== "project") issues.push(`${label}.level 必须为 platform 或 project`);
      for (const field of ["supportedScenarios", "constraints"] as const) if (!isStringArray(value[field])) issues.push(`${label}.${field} 必须是字符串数组`);
    } else if (value.kind === "pattern") {
      for (const field of ["applicableScenarios", "nonApplicableScenarios", "pageStructure", "interactionRules"] as const) {
        if (!isStringArray(value[field])) issues.push(`${label}.${field} 必须是字符串数组`);
      }
    } else if (value.kind === "component") {
      if (!isString(value.componentType) || !isStringArray(value.usageRules)) issues.push(`${label} 组件必须包含 componentType 和 usageRules`);
    } else if (value.kind === "constraint") {
      if ((value.severity !== "error" && value.severity !== "warning") || !isString(value.rule)) issues.push(`${label} 约束必须包含 severity 和 rule`);
    } else if (value.kind === "case") {
      if (!isString(value.requirement) || !["configuration", "platform-extension", "project-customization"].includes(String(value.decision)) || !isString(value.outcome)) {
        issues.push(`${label} 案例必须包含 requirement、decision 和 outcome`);
      }
    }
  }
}
