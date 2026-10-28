import { browserFetch, browserWindow } from './browserGlobals';
import { buildClientErrorPayload } from './clientErrorPayload';
import { ClientErrorLevel } from './clientErrorTypes';
import type {
  ClientErrorPayload,
  ClientErrorReporter,
  ClientErrorReporterOptions,
} from './clientErrorTypes';

export const DEFAULT_CLIENT_ERRORS_ENDPOINT = '/bff/client-errors';
export const DEFAULT_MAX_CLIENT_ERROR_REPORTS = 10;
export const DEFAULT_MAX_TRANSPORT_FAILURES = 3;
export const DEFAULT_CLIENT_ERROR_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  'X-BFF-Csrf': '1',
};

interface ReporterState {
  sent: Set<string>;
  failures: number;
  busy: boolean;
}

function dedupeKey(payload: ClientErrorPayload): string {
  return `${payload.level}|${payload.message}|${payload.stack ?? ''}`;
}

function errorFromEvent(event: Event): unknown {
  const record = event as unknown as Record<string, unknown>;
  return record.error ?? record.message;
}

function reasonFromEvent(event: Event): unknown {
  return (event as unknown as Record<string, unknown>).reason;
}

function isFailedResponse(response: unknown): boolean {
  return (response as { ok?: unknown } | undefined)?.ok === false;
}

function send(
  fetchImpl: NonNullable<ClientErrorReporterOptions['fetchImpl']>,
  options: ClientErrorReporterOptions,
  payload: ClientErrorPayload,
  state: ReporterState,
): void {
  const onFailure = (): void => {
    state.failures += 1;
  };
  fetchImpl(options.endpoint ?? DEFAULT_CLIENT_ERRORS_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { ...DEFAULT_CLIENT_ERROR_HEADERS, ...options.headers },
    body: JSON.stringify(payload),
  }).then((response) => {
    if (isFailedResponse(response)) {onFailure();}
  }, onFailure);
}

/** Posts uncaught browser errors and `report()` calls to `/bff/client-errors`, deduped and capped, never throwing. */
export function installClientErrorReporter(options: ClientErrorReporterOptions = {}): ClientErrorReporter {
  const win = options.win ?? browserWindow();
  const fetchImpl = options.fetchImpl ?? browserFetch();
  const maxReports = options.maxReports ?? DEFAULT_MAX_CLIENT_ERROR_REPORTS;
  const maxFailures = options.maxTransportFailures ?? DEFAULT_MAX_TRANSPORT_FAILURES;
  const state: ReporterState = { sent: new Set(), failures: 0, busy: false };

  const report = (error: unknown, level: ClientErrorLevel = ClientErrorLevel.Error): boolean => {
    const capped = state.sent.size >= maxReports || state.failures >= maxFailures;
    if (state.busy || capped || win === undefined || fetchImpl === undefined) {return false;}
    state.busy = true;
    try {
      const payload = buildClientErrorPayload(error, win.location.pathname, level, options.appVersion);
      const key = dedupeKey(payload);
      if (state.sent.has(key)) {return false;}
      state.sent.add(key);
      send(fetchImpl, options, payload, state);
      return true;
    } catch {
      return false;
    } finally {
      state.busy = false;
    }
  };
  const onError = (event: Event): void => {
    report(errorFromEvent(event));
  };
  const onRejection = (event: Event): void => {
    report(reasonFromEvent(event));
  };

  if (win !== undefined && options.listen !== false) {
    win.addEventListener('error', onError);
    win.addEventListener('unhandledrejection', onRejection);
  }
  return {
    report,
    dispose: (): void => {
      win?.removeEventListener('error', onError);
      win?.removeEventListener('unhandledrejection', onRejection);
    },
  };
}
