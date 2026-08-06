import {
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_TYPES,
  RULE_CHECK_TYPES,
  RULE_SEVERITIES,
  type KnowledgeCatalogFile,
  type KnowledgeEntity,
  type KnowledgeType,
} from "./types.js";

export class KnowledgeValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`知识库校验失败：\n- ${issues.join("\n- ")}`);
    this.name = "KnowledgeValidationError";
  }
}

const ALLOWED_REFERENCE_TYPES: Record<KnowledgeType, KnowledgeType[]> = {
  business: ["pattern"],
  pattern: ["component"],
  component: ["rule"],
  rule: [],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSemver = (value: unknown): value is string =>
  typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);

export class KnowledgeValidator {
  validateCatalogFile(value: unknown): asserts value is KnowledgeCatalogFile {
    const issues: string[] = [];
    if (!isObject(value)) issues.push("catalog.json 顶层必须是对象");
    else {
      if (value.schemaVersion !== "0.5") issues.push('catalog.schemaVersion 必须为 "0.5"');
      if (!isSemver(value.version)) issues.push("catalog.version 必须是语义化版本");
      if (!Array.isArray(value.entries) || value.entries.some((item) => typeof item !== "string" || !item)) {
        issues.push("catalog.entries 必须是非空路径字符串数组");
      }
    }
    if (issues.length) throw new KnowledgeValidationError(issues);
  }

  validateEntities(values: unknown[]): asserts values is KnowledgeEntity[] {
    const issues: string[] = [];
    const entities = values.filter(isObject);
    values.forEach((value, index) => this.validateEntityShape(value, index, issues));

    const ids = new Set<string>();
    for (const entity of entities) {
      if (typeof entity.id !== "string") continue;
      if (ids.has(entity.id)) issues.push(`知识 ID 重复：${entity.id}`);
      ids.add(entity.id);
    }

    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    for (const entity of entities) {
      if (!Array.isArray(entity.references) || !KNOWLEDGE_TYPES.includes(entity.type as KnowledgeType)) continue;
      for (const reference of entity.references) {
        if (!isObject(reference) || typeof reference.id !== "string") continue;
        const target = byId.get(reference.id);
        if (!target) {
          issues.push(`${String(entity.id)} 引用了不存在的知识：${reference.id}`);
          continue;
        }
        if (reference.type !== target.type) {
          issues.push(`${String(entity.id)} 的引用 ${reference.id} 声明为 ${String(reference.type)}，实际为 ${String(target.type)}`);
        }
        const allowed = ALLOWED_REFERENCE_TYPES[entity.type as KnowledgeType];
        if (!allowed.includes(target.type as KnowledgeType)) {
          issues.push(`${String(entity.id)}(${String(entity.type)}) 不允许引用 ${reference.id}(${String(target.type)})`);
        }
      }
    }

    this.findCycles(entities, byId, issues);
    if (issues.length) throw new KnowledgeValidationError(issues);
  }

  private validateEntityShape(value: unknown, index: number, issues: string[]): void {
    const path = `entries[${index}]`;
    if (!isObject(value)) {
      issues.push(`${path} 必须是对象`);
      return;
    }
    for (const field of ["id", "name", "description"] as const) {
      if (typeof value[field] !== "string" || !value[field].trim()) issues.push(`${path}.${field} 缺失或为空`);
    }
    if (!KNOWLEDGE_TYPES.includes(value.type as KnowledgeType)) issues.push(`${path}.type 非法：${String(value.type)}`);
    if (!isSemver(value.version)) issues.push(`${path}.version 必须是语义化版本`);
    if (!KNOWLEDGE_STATUSES.includes(value.status as never)) issues.push(`${path}.status 非法：${String(value.status)}`);
    for (const field of ["tags", "appliesTo"] as const) {
      if (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== "string" || !item)) {
        issues.push(`${path}.${field} 必须是字符串数组`);
      }
    }
    if (!Array.isArray(value.references)) issues.push(`${path}.references 必须是数组`);
    else value.references.forEach((reference, referenceIndex) => {
      if (!isObject(reference) || typeof reference.id !== "string" || !KNOWLEDGE_TYPES.includes(reference.type as KnowledgeType)) {
        issues.push(`${path}.references[${referenceIndex}] 必须包含有效 id 和 type`);
      }
    });
    if (value.type === "rule") {
      if (!RULE_SEVERITIES.includes(value.severity as never)) issues.push(`${path}.severity 非法：${String(value.severity)}`);
      if (!RULE_CHECK_TYPES.includes(value.checkType as never)) issues.push(`${path}.checkType 非法：${String(value.checkType)}`);
      if (!isObject(value.assertion) || typeof value.assertion.operator !== "string" || typeof value.assertion.path !== "string") {
        issues.push(`${path}.assertion 必须包含 operator 和 path`);
      }
    }
  }

  private findCycles(entities: Record<string, unknown>[], byId: Map<unknown, Record<string, unknown>>, issues: string[]): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string, trail: string[]): void => {
      if (visiting.has(id)) {
        issues.push(`知识引用存在环路：${[...trail, id].join(" -> ")}`);
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      const entity = byId.get(id);
      if (entity && Array.isArray(entity.references)) {
        for (const reference of entity.references) if (isObject(reference) && typeof reference.id === "string") visit(reference.id, [...trail, id]);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const entity of entities) if (typeof entity.id === "string") visit(entity.id, []);
  }
}
