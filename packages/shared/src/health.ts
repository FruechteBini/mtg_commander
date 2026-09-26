export type HealthStatus = "ok" | "degraded";

export interface ServiceHealth {
  service: "api" | "web";
  status: HealthStatus;
  version: string;
  timestamp: string;
}

export type EngineConnectionStatus =
  | "disabled"
  | "idle"
  | "connecting"
  | "authenticating"
  | "authenticated"
  | "reconnecting"
  | "authFailed"
  | "failed"
  | "closed";

export interface AppStatus extends ServiceHealth {
  architectureVersion: 1;
  protocolVersion: 5;
  engineConnected: boolean;
  engineStatus: EngineConnectionStatus;
}

export function createServiceHealth(
  service: ServiceHealth["service"],
  version: string,
  status: HealthStatus = "ok",
): ServiceHealth {
  return {
    service,
    status,
    version,
    timestamp: new Date().toISOString(),
  };
}
