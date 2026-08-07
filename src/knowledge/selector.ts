import type {
  KnowledgeCatalog,
  KnowledgeEntity,
  KnowledgeSelectionInput,
  KnowledgeSelectionResult,
  KnowledgeType,
  SelectedKnowledge,
} from "./types.js";

export class KnowledgeSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeSelectionError";
  }
}

const TYPE_ORDER: Record<KnowledgeType, number> = {
  business: 0,
  pattern: 1,
  component: 2,
  rule: 3,
};

const normalize = (value: string): string => value.toLocaleLowerCase().replace(/\s+/g, "");

const inputText = (input: KnowledgeSelectionInput): string => {
  const metadata = Object.values(input.metadata ?? {}).flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );
  return normalize([input.text, ...metadata].join(" "));
};

export class KnowledgeSelector {
  select(catalog: KnowledgeCatalog, input: KnowledgeSelectionInput): KnowledgeSelectionResult {
    const corpus = inputText(input);
    const selected = new Map<string, SelectedKnowledge>();

    for (const entity of catalog.entities) {
      if (entity.status !== "active") continue;
      const matches = [...entity.tags, ...entity.appliesTo]
        .filter((term) => normalize(term).length >= 2 && corpus.includes(normalize(term)));
      const uniqueMatches = [...new Set(matches)];
      const minimumMatches = entity.type === "business" ? 2 : 1;
      if (uniqueMatches.length < minimumMatches) continue;
      selected.set(entity.id, this.selection(entity, "automatic", `匹配关键词：${uniqueMatches.join("、")}`, uniqueMatches.length));
    }

    for (const id of [...new Set(input.explicitKnowledgeIds ?? [])]) {
      const entity = catalog.byId.get(id);
      if (!entity) throw new KnowledgeSelectionError(`显式指定的知识 ID 不存在：${id}`);
      if (entity.status !== "active") throw new KnowledgeSelectionError(`显式指定的知识不可用：${id}`);
      selected.set(id, this.selection(entity, "explicit", "由需求配置显式指定", Number.MAX_SAFE_INTEGER));
    }

    const roots = [...selected.keys()];
    for (const id of roots) this.addDependencies(catalog, id, selected, new Set());

    return {
      catalogVersion: catalog.version,
      selectedKnowledge: [...selected.values()].sort((left, right) =>
        TYPE_ORDER[left.type] - TYPE_ORDER[right.type]
        || right.score - left.score
        || left.knowledgeId.localeCompare(right.knowledgeId),
      ),
    };
  }

  private addDependencies(
    catalog: KnowledgeCatalog,
    id: string,
    selected: Map<string, SelectedKnowledge>,
    visiting: Set<string>,
  ): void {
    if (visiting.has(id)) return;
    visiting.add(id);
    const entity = catalog.byId.get(id);
    if (!entity) return;
    for (const reference of entity.references) {
      const dependency = catalog.byId.get(reference.id);
      if (!dependency || dependency.status !== "active") continue;
      if (!selected.has(dependency.id)) {
        selected.set(dependency.id, this.selection(dependency, "automatic", `由 ${id} 引用补齐`, 0));
      }
      this.addDependencies(catalog, dependency.id, selected, visiting);
    }
    visiting.delete(id);
  }

  private selection(
    entity: KnowledgeEntity,
    source: SelectedKnowledge["source"],
    reason: string,
    score: number,
  ): SelectedKnowledge {
    return { knowledgeId: entity.id, version: entity.version, type: entity.type, source, reason, score };
  }
}
