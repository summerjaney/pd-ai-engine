export type DocumentFormat = "docx" | "pdf";

export type DocumentBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; language?: string; content: string }
  | { type: "image"; alt: string; source: string };

export interface DocumentSource {
  id: string;
  title: string;
  sourcePath: string;
  blocks: DocumentBlock[];
}

export interface DocumentDsl {
  schemaVersion: "0.9";
  metadata: {
    title: string;
    projectName?: string;
    productVersion?: string;
    requirementId?: string;
    requirementRevision?: number;
    engineVersion: string;
    generatedAt: string;
  };
  template: {
    id: "pae-standard";
    locale: "zh-CN";
    cover: true;
    tableOfContents: true;
    numberedHeadings: true;
    headerFooter: true;
  };
  sources: DocumentSource[];
}

export interface DocumentRenderRequest {
  format: DocumentFormat;
  document: DocumentDsl;
  outputPath: string;
}

export interface DocumentRenderResult {
  format: DocumentFormat;
  outputPath: string;
  status: "PLANNED" | "GENERATED" | "FAILED";
  renderer: string;
  message?: string;
}

export interface DocumentRenderer {
  readonly name: string;
  readonly format: DocumentFormat;
  render(request: DocumentRenderRequest): Promise<DocumentRenderResult>;
}

export interface DocumentExportManifest {
  schemaVersion: "0.9";
  requirementId?: string;
  generatedAt: string;
  documentModelPath: string;
  requestedFormats: DocumentFormat[];
  results: DocumentRenderResult[];
  status: "PLANNED" | "GENERATED" | "PARTIAL" | "FAILED";
}
