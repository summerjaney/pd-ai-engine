import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformModule, PlatformModuleCatalog, PlatformModuleGraph } from "./types.js";
import { PlatformModuleValidator } from "./validator.js";

export class PlatformModuleLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "PlatformModuleLoadError"; }
}

export class PlatformModuleService {
  constructor(private readonly validator: PlatformModuleValidator = new PlatformModuleValidator()) {}

  async load(directory = path.resolve("knowledge/platform/modules")): Promise<PlatformModuleCatalog> {
    const rawCatalog = await this.readJson(path.join(directory, "catalog.json"));
    this.validator.validateCatalog(rawCatalog);
    const modules: unknown[] = [];
    for (const entry of rawCatalog.entries) {
      const entryPath = path.resolve(directory, entry);
      if (path.relative(directory, entryPath).startsWith("..")) throw new PlatformModuleLoadError(`平台模块文件路径越界：${entry}`);
      modules.push(await this.readJson(entryPath));
    }
    this.validator.validateModules(modules);
    const typed = modules as PlatformModule[];
    return { schemaVersion: "1.6", version: rawCatalog.version, productId: rawCatalog.productId, modules: typed, byId: new Map(typed.map((item) => [item.id, item])) };
  }

  graph(catalog: PlatformModuleCatalog): PlatformModuleGraph {
    return {
      schemaVersion: "1.6",
      productId: catalog.productId,
      catalogVersion: catalog.version,
      nodes: catalog.modules.map(({ id, name, version, status }) => ({ id, name, version, status })),
      edges: catalog.modules.flatMap((module) => module.dependencies.map((dependency) => ({ ...dependency, from: module.id, to: dependency.moduleId }))),
    };
  }

  renderMermaid(catalog: PlatformModuleCatalog): string {
    const graph = this.graph(catalog);
    const ids = new Map(graph.nodes.map((node, index) => [node.id, `M${index + 1}`]));
    const lines = ["flowchart TD", ...graph.nodes.map((node) => `  ${ids.get(node.id)}[\"${node.name}\"]`)];
    for (const edge of graph.edges) lines.push(`  ${ids.get(edge.from)} -->|${edge.type}| ${ids.get(edge.to)}`);
    return `${lines.join("\n")}\n`;
  }

  private async readJson(filePath: string): Promise<unknown> {
    try { return JSON.parse(await readFile(filePath, "utf8")); }
    catch (error) { throw new PlatformModuleLoadError(`无法读取平台模块文件：${filePath}`, { cause: error }); }
  }
}
