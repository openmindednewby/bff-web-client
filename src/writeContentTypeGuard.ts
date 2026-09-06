/**
 * Write-verb Content-Type guard — makes the 415 class structurally impossible.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-09-06 a door check-in POST returned 415 Unsupported Media Type in production
 * while every automated check was green. The instance default in `createBffAxiosClient`
 * already sets `Content-Type: application/json` — and it was still wrong, because:
 *
 *     axios v1's XHR adapter does `if (requestData === undefined) headers.setContentType(null)`
 *
 * i.e. axios STRIPS Content-Type when a request has no body. A body-less POST therefore
 * goes out with no content type no matter what the instance defaults say. Guarding the
 * HEADER cannot fix this. The guard has to operate on the BODY, so that axios has nothing
 * to strip.
 *
 * THE RULE
 * --------
 * This client is incapable of emitting a write without a correct Content-Type. It either
 * sets one, or it throws — it never emits a request that is already known to 415.
 *
 * WHAT IS DELIBERATELY NOT GUARDED
 * --------------------------------
 * Multipart / binary bodies (FormData, Blob, ArrayBuffer, URLSearchParams, streams) MUST
 * NOT carry a JSON content type — the runtime sets `multipart/form-data` plus the boundary
 * itself, and forcing a value there causes a *different* 415. Those are detected here and
 * passed through untouched, which replaces the hand-rolled per-app override
 * (`headers: { 'Content-Type': undefined }`) that each app was maintaining separately.
 */

import type { InternalAxiosRequestConfig, AxiosInstance } from 'axios';

const JSON_CONTENT_TYPE = 'application/json';
const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const CONTENT_TYPE_HEADER = 'content-type';

/**
 * Bodies whose content type the runtime must choose (boundary, encoding). Never stamp
 * `application/json` on these — that is a 415 in the other direction.
 */
function isRuntimeTypedBody(body: unknown): boolean {
  if (body === undefined || body === null) {
    return false;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return true;
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return true;
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) {
    return true;
  }
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return true;
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return true;
  }
  return false;
}

function readContentType(headers: unknown): string | undefined {
  if (typeof headers !== 'object' || headers === null) {
    return undefined;
  }
  const bag = headers as { get?: (name: string) => unknown } & Record<string, unknown>;
  if (typeof bag.get === 'function') {
    const viaGetter = bag.get(CONTENT_TYPE_HEADER);
    if (typeof viaGetter === 'string' && viaGetter !== '') {
      return viaGetter;
    }
  }
  for (const key of Object.keys(bag)) {
    if (key.toLowerCase() !== CONTENT_TYPE_HEADER) {
      continue;
    }
    const value = bag[key];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return undefined;
}

function writeContentType(headers: unknown, value: string): void {
  const bag = headers as { set?: (name: string, value: string) => unknown } & Record<string, unknown>;
  if (typeof bag.set === 'function') {
    bag.set(CONTENT_TYPE_HEADER, value);
    return;
  }
  bag['Content-Type'] = value;
}

/**
 * The guard, as a pure function over a request config, so it is testable without a network
 * stack and without axios internals. Returns the config it wants sent.
 *
 * @throws if a write would leave with a JSON body and no content type. That request is
 *   already known to 415 — failing here names the call site instead of blaming the server.
 */
function applyWriteContentTypeGuard(
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
  const method = (config.method ?? 'get').toLowerCase();
  if (!WRITE_METHODS.has(method)) {
    return config;
  }

  if (isRuntimeTypedBody(config.data)) {
    return config;
  }

  const headerBag: Record<string, unknown> | undefined = config.headers as unknown as
    | Record<string, unknown>
    | undefined;
  const callerContentType = readContentType(headerBag);
  // An explicit `Content-Type: undefined` is the documented multipart opt-out. It must stay
  // an EXPLICIT key — an absent header is a defect, a present-but-undefined one is a choice.
  const callerOptedOut =
    headerBag !== undefined &&
    Object.keys(headerBag).some(
      (k) => k.toLowerCase() === CONTENT_TYPE_HEADER && headerBag[k] === undefined,
    );
  if (callerOptedOut) {
    return config;
  }

  // THE LOAD-BEARING LINE. axios drops Content-Type when data is undefined, so a body-less
  // write must carry an empty JSON object for the header to survive to the wire.
  if (config.data === undefined || config.data === null) {
    config.data = {};
  }

  if (callerContentType === undefined) {
    writeContentType(config.headers, JSON_CONTENT_TYPE);
  }

  const resolved = readContentType(config.headers as unknown);
  if (resolved === undefined) {
    throw new Error(
      `[bff-web-client] Refusing to send ${method.toUpperCase()} ${String(config.url ?? '<no url>')} ` +
        'with a JSON body and no Content-Type — the server would answer 415. ' +
        'Pass a body, or set an explicit Content-Type, or use a FormData/Blob body for uploads.',
    );
  }

  return config;
}

/**
 * Installs the guard as the FIRST request interceptor on an instance. Registered by
 * `createBffAxiosClient` for every consumer; exported so a custom chain can opt in.
 */
function registerWriteContentTypeGuard(instance: AxiosInstance): void {
  instance.interceptors.request.use(applyWriteContentTypeGuard);
}

export { applyWriteContentTypeGuard, registerWriteContentTypeGuard, JSON_CONTENT_TYPE, WRITE_METHODS };
