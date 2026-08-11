import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StageId } from "../domain/types.js";

export const RUN_SCHEMA_VERSION = "1.0" as const;
export type RunStatus = "PENDING" | "RUNNING" | "WAITING_CONFIRMATION" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "STALE";

export interface RunStageState {
  id: StageId;
  status: RunStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface RunState {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  runId: string;
  engineVersion: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  currentStage?: StageId;
  stages: RunStageState[];
}

export interface RunEvent {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  runId: string;
  timestamp: string;
  type: "RUN_STARTED" | "STAGE_STARTED" | "STAGE_SUCCEEDED" | "STAGE_FAILED" | "STAGE_SKIPPED" | "RUN_SUCCEEDED" | "RUN_FAILED";
  stage?: StageId;
  error?: string;
}

export class RunStateRecorder {
  private readonly statePath: string;
  private readonly eventsPath: string;

  constructor(private readonly outputDirectory: string, private readonly state: RunState) {
    this.statePath = path.join(outputDirectory, "run.json");
    this.eventsPath = path.join(outputDirectory, "run-events.jsonl");
  }

  async start(): Promise<void> {
    this.state.status = "RUNNING";
    await this.persist();
    await this.event({ type: "RUN_STARTED" });
  }

  async stageStarted(stage: StageId): Promise<void> {
    this.state.currentStage = stage;
    const current = this.state.stages.find((item) => item.id === stage)!;
    current.status = "RUNNING";
    current.startedAt = new Date().toISOString();
    await this.persist();
    await this.event({ type: "STAGE_STARTED", stage });
  }

  async stageFinished(stage: StageId, status: "SUCCEEDED" | "FAILED" | "SKIPPED", error?: string): Promise<void> {
    const current = this.state.stages.find((item) => item.id === stage)!;
    current.status = status;
    current.error = error;
    current.finishedAt = new Date().toISOString();
    if (current.startedAt) current.durationMs = Date.parse(current.finishedAt) - Date.parse(current.startedAt);
    await this.persist();
    await this.event({ type: status === "SUCCEEDED" ? "STAGE_SUCCEEDED" : status === "FAILED" ? "STAGE_FAILED" : "STAGE_SKIPPED", stage, error });
  }

  async finish(status: "SUCCEEDED" | "FAILED"): Promise<void> {
    this.state.status = status;
    this.state.currentStage = undefined;
    this.state.finishedAt = new Date().toISOString();
    await this.persist();
    await this.event({ type: status === "SUCCEEDED" ? "RUN_SUCCEEDED" : "RUN_FAILED" });
  }

  private async persist(): Promise<void> {
    await writeFile(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }

  private async event(event: Omit<RunEvent, "schemaVersion" | "runId" | "timestamp">): Promise<void> {
    const record: RunEvent = { schemaVersion: RUN_SCHEMA_VERSION, runId: this.state.runId, timestamp: new Date().toISOString(), ...event };
    await appendFile(this.eventsPath, `${JSON.stringify(record)}\n`, "utf8");
  }
}
