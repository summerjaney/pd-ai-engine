import type { KnowledgeSelectionResult, SelectedKnowledge } from "./types.js";

export interface KnowledgeTrace {
  knowledgeCatalogVersion: string;
  selectedKnowledge: SelectedKnowledge[];
}

export const createKnowledgeTrace = (selection: KnowledgeSelectionResult): KnowledgeTrace => ({
  knowledgeCatalogVersion: selection.catalogVersion,
  selectedKnowledge: selection.selectedKnowledge.map((item) => ({ ...item })),
});
