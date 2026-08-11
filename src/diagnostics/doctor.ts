import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadPaeConfig } from "../config/loader.js";
import { readEngineVersion } from "../version.js";

export type DoctorCheckStatus = "PASS" | "WARN" | "FAIL";
export interface DoctorCheck { id: string; status: DoctorCheckStatus; message: string; }
export interface DoctorReport { schemaVersion: "1.0"; checkedAt: string; status: "READY" | "READY_WITH_WARNINGS" | "NOT_READY"; checks: DoctorCheck[]; }

async function commandExists(command: string): Promise<boolean> {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    try { await access(path.join(directory, command), constants.X_OK); return true; } catch { /* continue */ }
  }
  return false;
}

export async function diagnosePae(options: { cwd?: string; nodeVersion?: string; now?: () => Date } = {}): Promise<DoctorReport> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const checks: DoctorCheck[] = [];
  const major = Number((options.nodeVersion ?? process.versions.node).split(".")[0]);
  checks.push({ id: "node", status: major >= 20 ? "PASS" : "FAIL", message: major >= 20 ? `Node.js ${options.nodeVersion ?? process.versions.node} 满足 >=20。` : `Node.js ${options.nodeVersion ?? process.versions.node} 过低，需要 >=20。` });
  try { checks.push({ id: "engine", status: "PASS", message: `PAE ${await readEngineVersion()} 可用。` }); }
  catch { checks.push({ id: "engine", status: "FAIL", message: "无法读取 PAE 版本。" }); }
  const config = await loadPaeConfig(cwd);
  checks.push({ id: "config", status: config.path ? "PASS" : "WARN", message: config.path ? `已加载配置：${config.path}` : "未找到 pae.config.json，将使用系统默认值。" });
  const probe = path.join(cwd, `.pae-doctor-${process.pid}.tmp`);
  try { await mkdir(cwd, { recursive: true }); await writeFile(probe, "ok", "utf8"); await rm(probe); checks.push({ id: "output", status: "PASS", message: `输出目录可写：${cwd}` }); }
  catch { checks.push({ id: "output", status: "FAIL", message: `输出目录不可写：${cwd}` }); }
  const openai = config.config.llm?.provider === "openai";
  checks.push({ id: "llm", status: openai && !process.env.OPENAI_API_KEY ? "FAIL" : "PASS", message: openai ? (process.env.OPENAI_API_KEY ? "OpenAI Provider 配置完整。" : "OpenAI Provider 缺少 OPENAI_API_KEY。") : "Mock Provider 可用。" });
  checks.push({ id: "git", status: await commandExists("git") ? "PASS" : "WARN", message: await commandExists("git") ? "Git 可用。" : "未找到 Git；不影响本地生成，但无法执行版本发布。" });
  checks.push({ id: "gh", status: await commandExists("gh") ? "PASS" : "WARN", message: await commandExists("gh") ? "GitHub CLI 可用。" : "未找到 GitHub CLI；不影响本地交付。" });
  const hasFail = checks.some((item) => item.status === "FAIL");
  const hasWarn = checks.some((item) => item.status === "WARN");
  return { schemaVersion: "1.0", checkedAt: (options.now ?? (() => new Date()))().toISOString(), status: hasFail ? "NOT_READY" : hasWarn ? "READY_WITH_WARNINGS" : "READY", checks };
}
