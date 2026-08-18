import {
  PLATFORM_MODULE_DEPENDENCY_TYPES,
  type PlatformModule,
  type PlatformModuleCatalogFile,
} from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isSemver = (value: unknown): value is string => isString(value) && /^\d+\.\d+\.\d+$/.test(value);

export class PlatformModuleValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`平台模块目录校验失败：\n- ${issues.join("\n- ")}`);
    this.name = "PlatformModuleValidationError";
  }
}

export class PlatformModuleValidator {
  validateCatalog(value: unknown): asserts value is PlatformModuleCatalogFile {
    const issues: string[] = [];
    if (!isObject(value)) issues.push("catalog.json 顶层必须是对象");
    else {
      if (value.schemaVersion !== "1.6") issues.push('catalog.schemaVersion 必须为 "1.6"');
      if (!isSemver(value.version)) issues.push("catalog.version 必须是语义化版本");
      if (!isString(value.productId)) issues.push("catalog.productId 缺失或为空");
      if (!isStringArray(value.entries)) issues.push("catalog.entries 必须是路径字符串数组");
    }
    if (issues.length) throw new PlatformModuleValidationError(issues);
  }

  validateModules(values: unknown[]): asserts values is PlatformModule[] {
    const issues: string[] = [];
    const modules = values.filter(isObject);
    values.forEach((value, index) => this.validateModule(value, index, issues));
    const ids = new Set<string>();
    for (const module of modules) {
      if (!isString(module.id)) continue;
      if (ids.has(module.id)) issues.push(`平台模块 ID 重复：${module.id}`);
      ids.add(module.id);
    }
    for (const module of modules) {
      if (!isString(module.id) || !Array.isArray(module.dependencies)) continue;
      for (const dependency of module.dependencies) {
        if (!isObject(dependency) || !isString(dependency.moduleId)) continue;
        if (dependency.moduleId === module.id) issues.push(`${module.id} 不得依赖自身`);
        else if (!ids.has(dependency.moduleId)) issues.push(`${module.id} 依赖不存在的模块：${dependency.moduleId}`);
      }
    }
    if (issues.length) throw new PlatformModuleValidationError(issues);
  }

  private validateModule(value: unknown, index: number, issues: string[]): void {
    const label = `entries[${index}]`;
    if (!isObject(value)) { issues.push(`${label} 必须是对象`); return; }
    for (const field of ["id", "name", "description"] as const) if (!isString(value[field])) issues.push(`${label}.${field} 缺失或为空`);
    if (!isSemver(value.version)) issues.push(`${label}.version 必须是语义化版本`);
    if (!["confirmed", "draft", "deprecated"].includes(String(value.status))) issues.push(`${label}.status 非法`);
    for (const field of ["responsibilities", "coreObjects", "capabilities", "extensionPoints"] as const) {
      if (!isStringArray(value[field])) issues.push(`${label}.${field} 必须是字符串数组`);
    }
    if (!isObject(value.source) || !isString(value.source.document)) issues.push(`${label}.source.document 缺失或为空`);
    if (!Array.isArray(value.dependencies)) issues.push(`${label}.dependencies 必须是数组`);
    else value.dependencies.forEach((dependency, dependencyIndex) => {
      if (!isObject(dependency) || !isString(dependency.moduleId) || !PLATFORM_MODULE_DEPENDENCY_TYPES.includes(dependency.type as never) || !isString(dependency.description) || typeof dependency.required !== "boolean") {
        issues.push(`${label}.dependencies[${dependencyIndex}] 必须包含有效 moduleId、type、description 和 required`);
      }
    });
  }
}
