export const ClientErrorLevel = {
  Error: 'error',
  Warning: 'warning',
} as const;

export type ClientErrorLevel = (typeof ClientErrorLevel)[keyof typeof ClientErrorLevel];

/** Body of `POST /bff/client-errors`; every field is already truncated to its contract limit. */
export interface ClientErrorPayload {
  message: string;
  stack?: string;
  page: string;
  appVersion?: string;
  traceId?: string;
  level: ClientErrorLevel;
}

export type ClientErrorFetch = (input: string, init: RequestInit) => Promise<unknown>;

export interface ClientErrorWindow {
  location: { pathname: string };
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

/** Options for {@link installClientErrorReporter}; every field has a safe default. */
export interface ClientErrorReporterOptions {
  endpoint?: string;
  appVersion?: string;
  maxReports?: number;
  maxTransportFailures?: number;
  headers?: Record<string, string>;
  listen?: boolean;
  win?: ClientErrorWindow;
  fetchImpl?: ClientErrorFetch;
}

export interface ClientErrorReporter {
  report(error: unknown, level?: ClientErrorLevel): boolean;
  dispose(): void;
}
