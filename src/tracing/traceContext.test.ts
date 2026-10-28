import axios from 'axios';

import { createBffAxiosClient } from '../createBffAxiosClient';

import { createTraceparent, extractTraceId, registerTraceparentInterceptor } from './traceContext';

import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;

function fixedBytes(value: number): (bytes: Uint8Array) => Uint8Array {
  return (bytes) => bytes.fill(value);
}

function captureSentHeaders(): { sent: InternalAxiosRequestConfig[]; adapter: (config: InternalAxiosRequestConfig) => Promise<never> } {
  const sent: InternalAxiosRequestConfig[] = [];
  const adapter = (config: InternalAxiosRequestConfig): Promise<never> => {
    sent.push(config);
    return Promise.reject(new Error('captured'));
  };
  return { sent, adapter };
}

describe('createTraceparent', () => {
  it('with the default random source, returns a W3C version-00 sampled traceparent', () => {
    const traceparent = createTraceparent();

    expect(traceparent).toMatch(TRACEPARENT_PATTERN);
  });

  it('with bytes of 0xab, encodes a 32-hex trace id and a 16-hex span id', () => {
    const traceparent = createTraceparent(fixedBytes(0xab));

    expect(traceparent).toBe(`00-${'ab'.repeat(16)}-${'ab'.repeat(8)}-01`);
  });

  it('with an all-zero random source, never returns the invalid all-zero ids', () => {
    const traceparent = createTraceparent(fixedBytes(0));

    expect(traceparent).not.toContain('0'.repeat(32));
    expect(traceparent).not.toContain(`-${'0'.repeat(16)}-`);
    expect(traceparent).toMatch(TRACEPARENT_PATTERN);
  });

  it('with no Web Crypto in the runtime, returns two valid and different traceparents', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    const values = [createTraceparent(), createTraceparent()];

    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    expect(values[0]).toMatch(TRACEPARENT_PATTERN);
    expect(values[1]).toMatch(TRACEPARENT_PATTERN);
    expect(values[0]).not.toBe(values[1]);
  });

  it('called twice, returns two different trace ids', () => {
    const first = createTraceparent();

    const second = createTraceparent();

    expect(first.split('-')[1]).not.toBe(second.split('-')[1]);
  });
});

describe('registerTraceparentInterceptor', () => {
  it('with two requests on one instance, sends a different traceparent on each', async () => {
    const { sent, adapter } = captureSentHeaders();
    const instance = axios.create({ adapter });
    registerTraceparentInterceptor(instance);

    await Promise.allSettled([instance.get('/a'), instance.post('/b', {})]);

    const values = sent.map((config) => String(config.headers.traceparent));
    expect(values[0]).toMatch(TRACEPARENT_PATTERN);
    expect(values[1]).toMatch(TRACEPARENT_PATTERN);
    expect(values[0]).not.toBe(values[1]);
  });

  it('with a caller-supplied traceparent, keeps the caller value', async () => {
    const callerValue = `00-${'cd'.repeat(16)}-${'ef'.repeat(8)}-01`;
    const { sent, adapter } = captureSentHeaders();
    const instance = axios.create({ adapter });
    registerTraceparentInterceptor(instance);

    await Promise.allSettled([instance.get('/a', { headers: { traceparent: callerValue } })]);

    expect(sent[0]?.headers.traceparent).toBe(callerValue);
  });
});

describe('createBffAxiosClient', () => {
  it('with no extra setup, sends a traceparent on a request', async () => {
    const { sent, adapter } = captureSentHeaders();
    const instance = createBffAxiosClient({ timeoutMs: 1000 });
    instance.defaults.adapter = adapter;

    await Promise.allSettled([instance.get('/a')]);

    expect(String(sent[0]?.headers.traceparent)).toMatch(TRACEPARENT_PATTERN);
  });
});

describe('extractTraceId', () => {
  const traceId = 'a'.repeat(32);
  const sentTraceId = 'b'.repeat(32);

  function makeError(response: unknown, sentHeaders: Record<string, string> = {}): AxiosError {
    return { isAxiosError: true, config: { headers: sentHeaders }, response } as unknown as AxiosError;
  }

  it('with a traceparent response header, returns its trace id segment', () => {
    const error = makeError({ status: 500, headers: { traceparent: `00-${traceId}-${'c'.repeat(16)}-01` }, data: {} });

    const result = extractTraceId(error);

    expect(result).toBe(traceId);
  });

  it('with an x-trace-id response header, returns it', () => {
    const error = makeError({ status: 500, headers: { 'x-trace-id': traceId }, data: {} });

    const result = extractTraceId(error);

    expect(result).toBe(traceId);
  });

  it('with a ProblemDetails traceId in traceparent form, returns the trace id segment', () => {
    const error = makeError({ status: 400, headers: {}, data: { traceId: `00-${traceId}-${'d'.repeat(16)}-00` } });

    const result = extractTraceId(error);

    expect(result).toBe(traceId);
  });

  it('with a bare ProblemDetails traceId, returns it', () => {
    const error = makeError({ status: 400, headers: {}, data: { traceId } });

    const result = extractTraceId(error);

    expect(result).toBe(traceId);
  });

  it('with no trace id in the response, returns the trace id the request sent', () => {
    const error = makeError(undefined, { traceparent: `00-${sentTraceId}-${'e'.repeat(16)}-01` });

    const result = extractTraceId(error);

    expect(result).toBe(sentTraceId);
  });

  it('with no trace id anywhere, returns undefined', () => {
    const error = makeError({ status: 500, headers: {}, data: 'oops' });

    const result = extractTraceId(error);

    expect(result).toBeUndefined();
  });

  it('with a non-axios value, returns undefined', () => {
    const result = extractTraceId(new Error('plain'));

    expect(result).toBeUndefined();
  });
});
