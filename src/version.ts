import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedVersion: string | undefined;

/**
 * 读取根 package.json 的 version 字段作为运行时版本唯一来源。
 * 解析顺序：编译产物所在目录的上级 package.json → 当前工作目录的 package.json。
 */
export async function readEngineVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    path.resolve(process.cwd(), "package.json"),
  ];
  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, "utf8");
      const parsed = JSON.parse(content) as { version?: string };
      if (parsed.version) {
        cachedVersion = parsed.version;
        return cachedVersion;
      }
    } catch {
      continue;
    }
  }
  throw new Error("无法读取根 package.json 中的 version 字段。");
}
