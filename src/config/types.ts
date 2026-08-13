export const PAE_CONFIG_SCHEMA_VERSION = "1.0" as const;

export type QualityGateLevel = "standard" | "release";

export interface PaeConfig {
  schemaVersion: typeof PAE_CONFIG_SCHEMA_VERSION;
  project?: {
    id?: string;
    name?: string;
    productVersion?: string;
  };
  llm?: {
    provider?: "mock" | "openai";
    model?: string;
  };
  knowledge?: {
    mode?: "auto" | "off";
  };
  extensions?: {
    enabled?: boolean;
    workspace?: string;
    directories?: string[];
  };
  mastergo?: {
    enabled?: boolean;
    write?: boolean;
  };
  delivery?: {
    formats?: Array<"docx" | "pdf">;
    qualityGate?: QualityGateLevel;
  };
  execution?: {
    retries?: number;
    resume?: boolean;
  };
}
