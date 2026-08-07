export interface MasterGoMcpConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MasterGoConnectionInfo {
  serverName?: string;
  serverVersion?: string;
  capabilities: string[];
}

export interface MasterGoTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MasterGoToolDiscovery {
  tools: MasterGoTool[];
  writableTools: string[];
  hasCanvasWriteCapability: boolean;
}

export interface MasterGoConnection {
  probe(): Promise<MasterGoConnectionInfo>;
  listTools(): Promise<MasterGoToolDiscovery>;
  close(): Promise<void>;
}

export type MasterGoDoctorStatus = "READY" | "NOT_CONFIGURED" | "COMMAND_NOT_FOUND" | "PROBE_FAILED";

export interface MasterGoDoctorCheck {
  id: "configuration" | "command" | "connection";
  status: "PASS" | "FAIL" | "SKIPPED";
  message: string;
}

export interface MasterGoDoctorReport {
  schemaVersion: "0.1";
  status: MasterGoDoctorStatus;
  checkedAt: string;
  configSource?: string;
  command?: string;
  checks: MasterGoDoctorCheck[];
  connection?: MasterGoConnectionInfo;
  nextAction?: string;
}
