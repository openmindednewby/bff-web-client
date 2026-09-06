/**
 * Shared request-shape assertions — pins method + Content-Type + body at every write seam.
 *
 * WHY THIS EXISTS
 * ---------------
 * The 2026-09-06 door check-in 415 was caught at a venue door. It was catchable in
 * milliseconds by a unit test, because the defect was entirely in the SHAPE of the request
 * the client emitted — no server, no browser, no network needed to observe it.
 *
 * Nothing asserted that shape, in any app. This helper is that assertion, and it lives in
 * the shared package so every app inherits it rather than each re-deriving it (or not).
 *
 * HOW TO USE IT (in an app's own unit tests, against its OWN configured client)
 *
 *   import { captureWriteRequests, expectJsonWriteShape } from '@dloizides/bff-web-client/testing';
 *
 *   it('emits a correctly shaped write for every verb', async () => {
 *     const sent = await captureWriteRequests(myConfiguredClient, '/checkin');
 *     expectJsonWriteShape(sent);        // throws with the offending verb named
 *   });
 *
 * WHAT THIS CANNOT OBSERVE
 * ------------------------
 * Whether the SERVER accepts the shape. It pins what the client emits, which is the half
 * that was wrong. Contract agreement with the endpoint still needs an integration test.
 */

import type { AxiosInstance, AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

/** One captured outbound request, reduced to the fields that cause 415s. */
interface CapturedRequest {
  method: string;
  url: string;
  contentType: string | undefined;
  data: unknown;
  hasBody: boolean;
}

const WRITE_VERBS = ['post', 'put', 'patch', 'delete'] as const;

type WriteVerb = (typeof WRITE_VERBS)[number];

function contentTypeOf(config: InternalAxiosRequestConfig): string | undefined {
  const raw: unknown = config.headers;
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const headers = raw as { get?: (n: string) => unknown } & Record<string, unknown>;
  if (typeof headers.get === 'function') {
    const v = headers.get('content-type');
    if (typeof v === 'string' && v !== '') {
      return v;
    }
  }
  for (const k of Object.keys(headers)) {
    const value = headers[k];
    if (k.toLowerCase() === 'content-type' && typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

/**
 * Drives every write verb through the given client with a stub adapter, returning what the
 * client actually put on the wire. The real interceptor chain runs; only the transport is
 * replaced — so this observes the request the app would genuinely have sent.
 *
 * @param client the app's OWN configured instance, not a fresh one — the point is to test
 *   the configuration, and a fresh instance would test this package instead of the app.
 * @param url a write path on the app's API.
 * @param body optional body to send; omit to exercise the body-less write that caused the 415.
 */
async function captureWriteRequests(
  client: AxiosInstance,
  url: string,
  body?: unknown,
): Promise<Record<WriteVerb, CapturedRequest>> {
  const originalAdapter = client.defaults.adapter;
  const captured: Partial<Record<WriteVerb, CapturedRequest>> = {};

  const stub: AxiosAdapter = async (config) =>
    Promise.resolve({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  client.defaults.adapter = stub;

  try {
    for (const verb of WRITE_VERBS) {
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose: one capture per verb
      const response = await client.request({ url, method: verb, data: body });
      const { config } = response;
      captured[verb] = {
        method: (config.method ?? verb).toLowerCase(),
        url: String(config.url ?? url),
        contentType: contentTypeOf(config),
        data: config.data,
        hasBody: config.data !== undefined && config.data !== null,
      };
    }
  } finally {
    client.defaults.adapter = originalAdapter;
  }

  return captured as Record<WriteVerb, CapturedRequest>;
}

/**
 * Asserts every captured write carries a JSON content type AND a body. Throws naming the
 * offending verb — the message is the thing a future reader needs, so it states the failure
 * mode rather than just the mismatch.
 */
function expectJsonWriteShape(captured: Record<WriteVerb, CapturedRequest>): void {
  const problems: string[] = [];
  for (const verb of WRITE_VERBS) {
    const req = captured[verb];
    if (req.contentType === undefined) {
      problems.push(
        `${verb.toUpperCase()} ${req.url}: no Content-Type — the server answers 415. ` +
          'axios strips Content-Type when data is undefined; the client must supply a body.',
      );
      continue;
    }
    if (!req.contentType.includes('json')) {
      problems.push(`${verb.toUpperCase()} ${req.url}: Content-Type is "${req.contentType}", expected JSON`);
    }
    if (!req.hasBody) {
      problems.push(`${verb.toUpperCase()} ${req.url}: declares JSON but carries no body`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Write-shape assertion failed:\n  - ${problems.join('\n  - ')}`);
  }
}

export { captureWriteRequests, expectJsonWriteShape, WRITE_VERBS };
export type { CapturedRequest, WriteVerb };
