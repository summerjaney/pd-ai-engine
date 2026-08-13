import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  EXTENSION_SCHEMA_VERSION,
  type ComposedExtensionContext,
  type ExtensionManifest,
  type ExtensionResource,
  type ExtensionResourceType,
  type ExtensionValidationResult,
  type LoadedExtension,
} from "./types.js";

const RESOURCE_TYPES: ExtensionResourceType[] = ["knowledge", "rules", "patterns", "workflows", "templates", "terminology"];
const EXTENSION_TYPES = new Set(["domain", "product", "workflow", "deliverable", "adapter"]);
const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function validateExtensionManifest(value: unknown): ExtensionValidationResult {
  const issues: ExtensionValidationResult["issues"] = [];
  const item = value as Partial<ExtensionManifest> | null;
  if (!item || typeof item !== "object" || Array.isArray(item)) return { valid: false, issues: [{ severity: "error", path: "$", message: "扩展清单必须是 JSON 对象。" }] };
  if (item.schemaVersion !== EXTENSION_SCHEMA_VERSION) issues.push({ severity: "error", path: "schemaVersion", message: `仅支持 ${EXTENSION_SCHEMA_VERSION}。` });
  if (!item.id || !ID_PATTERN.test(item.id)) issues.push({ severity: "error", path: "id", message: "扩展 ID 必须使用小写字母、数字、点或连字符。" });
  if (!item.name?.trim()) issues.push({ severity: "error", path: "name", message: "扩展名称不能为空。" });
  if (!item.type || !EXTENSION_TYPES.has(item.type)) issues.push({ severity: "error", path: "type", message: "扩展类型无效。" });
  if (!item.version || !VERSION_PATTERN.test(item.version)) issues.push({ severity: "error", path: "version", message: "扩展版本必须符合 SemVer。" });
  if (!item.compatibleWith?.pae) issues.push({ severity: "error", path: "compatibleWith.pae", message: "必须声明 PAE 兼容范围。" });
  if (!item.provides || typeof item.provides !== "object") issues.push({ severity: "error", path: "provides", message: "必须声明扩展资源。" });
  for (const dependency of item.extends ?? []) if (!ID_PATTERN.test(dependency)) issues.push({ severity: "error", path: "extends", message: `依赖扩展 ID 无效：${dependency}` });
  for (const [type, paths] of Object.entries(item.provides ?? {})) {
    if (!RESOURCE_TYPES.includes(type as ExtensionResourceType)) issues.push({ severity: "error", path: `provides.${type}`, message: "不支持的资源类型。" });
    if (!Array.isArray(paths) || paths.some((resourcePath) => typeof resourcePath !== "string" || path.isAbsolute(resourcePath) || resourcePath.includes(".."))) {
      issues.push({ severity: "error", path: `provides.${type}`, message: "资源路径必须是扩展目录内的安全相对路径。" });
    }
  }
  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}

export async function loadExtension(root: string): Promise<LoadedExtension> {
  const manifestPath = path.join(root, "extension.json");
  let manifest: unknown;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) { throw new Error(`无法读取扩展清单 ${manifestPath}：${(error as Error).message}`); }
  const validation = validateExtensionManifest(manifest);
  if (!validation.valid) throw new Error(`扩展清单校验失败：${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
  const typed = manifest as ExtensionManifest;
  const resources: ExtensionResource[] = [];
  for (const type of RESOURCE_TYPES) {
    for (const relativePath of typed.provides[type] ?? []) {
      const absolutePath = path.resolve(root, relativePath);
      if (!absolutePath.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`扩展资源越界：${relativePath}`);
      await access(absolutePath);
      const raw = await readFile(absolutePath, "utf8");
      let value: unknown = raw;
      if (relativePath.endsWith(".json")) {
        try { value = JSON.parse(raw); } catch { throw new Error(`扩展资源不是有效 JSON：${relativePath}`); }
      }
      const id = value && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : undefined;
      resources.push({ id, value, source: { extensionId: typed.id, extensionVersion: typed.version, extensionType: typed.type, resourceType: type, path: relativePath } });
    }
  }
  return { root: path.resolve(root), manifest: typed, resources };
}

export async function discoverExtensions(directory: string): Promise<LoadedExtension[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const discovered: LoadedExtension[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const root = path.join(directory, entry.name);
    try { await access(path.join(root, "extension.json")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    discovered.push(await loadExtension(root));
  }
  return discovered;
}

function orderExtensions(extensions: LoadedExtension[]): LoadedExtension[] {
  const byId = new Map(extensions.map((extension) => [extension.manifest.id, extension]));
  if (byId.size !== extensions.length) throw new Error("扩展 ID 重复。");
  const result: LoadedExtension[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (extension: LoadedExtension): void => {
    if (visited.has(extension.manifest.id)) return;
    if (visiting.has(extension.manifest.id)) throw new Error(`扩展依赖存在循环：${extension.manifest.id}`);
    visiting.add(extension.manifest.id);
    for (const dependencyId of extension.manifest.extends ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) throw new Error(`缺少依赖扩展：${extension.manifest.id} → ${dependencyId}`);
      visit(dependency);
    }
    visiting.delete(extension.manifest.id); visited.add(extension.manifest.id); result.push(extension);
  };
  for (const extension of extensions) visit(extension);
  return result;
}

export function composeExtensionContext(extensions: LoadedExtension[]): ComposedExtensionContext {
  const ordered = orderExtensions(extensions);
  const selected = new Map<string, ExtensionResource>();
  const anonymous: ExtensionResource[] = [];
  const conflicts: ComposedExtensionContext["conflicts"] = [];
  for (const extension of ordered) {
    for (const resource of extension.resources) {
      if (!resource.id) { anonymous.push(resource); continue; }
      const key = `${resource.source.resourceType}:${resource.id}`;
      const previous = selected.get(key);
      if (previous) conflicts.push({ resourceType: resource.source.resourceType, resourceId: resource.id, previous: previous.source, selected: resource.source, resolution: "more-specific-extension" });
      selected.set(key, resource);
    }
  }
  return {
    schemaVersion: EXTENSION_SCHEMA_VERSION,
    extensions: ordered.map(({ manifest }) => ({ id: manifest.id, name: manifest.name, type: manifest.type, version: manifest.version })),
    resources: [...selected.values(), ...anonymous], conflicts,
  };
}
