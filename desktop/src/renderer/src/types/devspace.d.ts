export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  timestamp: string
}

export interface DevSpaceAPI {
  checkBackend(): Promise<HealthResponse>
}

declare global {
  interface Window {
    devspace: DevSpaceAPI
  }
}
