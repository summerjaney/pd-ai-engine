import { readFile } from "node:fs/promises";
import path from "node:path";
import { composeExtensionContext, loadExtension } from "./service.js";
import { EXTENSION_SCHEMA_VERSION, type ExtensionWorkspace, type LoadedExtensionWorkspace } from "./types.js";

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function validateWorkspace(value: unknown): asserts value is ExtensionWorkspace {
  const item = value as Partial<ExtensionWorkspace> | null;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("产品工作空间必须是 JSON 对象。");
  if (item.schemaVersion !== EXTENSION_SCHEMA_VERSION) throw new Error(`产品工作空间 schemaVersion 必须为 ${EXTENSION_SCHEMA_VERSION}。`);
  if (!item.id || !ID_PATTERN.test(item.id)) throw new Error("产品工作空间 ID 无效。");
  if (!item.name?.trim() || !item.product?.name?.trim() || !item.product.version?.trim()) throw new Error("产品工作空间缺少名称、产品名称或产品版本。");
  if (!Array.isArray(item.extensionDirectories) || item.extensionDirectories.length === 0 || item.extensionDirectories.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error("产品工作空间必须声明至少一个扩展目录。");
  }
}

export async function loadExtensionWorkspace(workspacePath: string): Promise<LoadedExtensionWorkspace> {
  const absolutePath = path.resolve(workspacePath);
  let workspace: unknown;
  try { workspace = JSON.parse(await readFile(absolutePath, "utf8")); }
  catch (error) { throw new Error(`无法读取产品工作空间 ${absolutePath}：${(error as Error).message}`); }
  validateWorkspace(workspace);
  const baseDirectory = path.dirname(absolutePath);
  const extensionDirectories = workspace.extensionDirectories.map((directory) => path.resolve(baseDirectory, directory));
  const extensions = await Promise.all(extensionDirectories.map(loadExtension));
  return { path: absolutePath, workspace, extensionDirectories, context: composeExtensionContext(extensions) };
}
