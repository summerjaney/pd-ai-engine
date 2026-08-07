import type { KnowledgeSelectionResult, KnowledgeType, SelectedKnowledge } from "./types.js";

export interface KnowledgeTrace {
  knowledgeCatalogVersion: string;
  selectedKnowledge: SelectedKnowledge[];
}

export const createKnowledgeTrace = (selection: KnowledgeSelectionResult): KnowledgeTrace => ({
  knowledgeCatalogVersion: selection.catalogVersion,
  selectedKnowledge: selection.selectedKnowledge.map((item) => ({ ...item })),
});

export const createStageKnowledgeTrace = (
  selection: KnowledgeSelectionResult,
  allowedTypes: ReadonlySet<KnowledgeType>,
): KnowledgeTrace => createKnowledgeTrace({
  catalogVersion: selection.catalogVersion,
  selectedKnowledge: selection.selectedKnowledge.filter((item) => allowedTypes.has(item.type)),
});
