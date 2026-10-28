import { isValueDefined } from '@dloizides/utils';

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

/** Fills the given byte array with random values and returns it. */
export type RandomBytesSource = (bytes: Uint8Array) => Uint8Array;

interface WebCryptoLike {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

const TRACEPARENT_HEADER = 'traceparent';
const TRACE_ID_HEADER = 'x-trace-id';
const TRACEPARENT_VERSION = '00';
const TRACEPARENT_SAMPLED_FLAGS = '01';
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;
const HEX_RADIX = 16;
const HEX_PAD = 2;
const BYTE_RANGE = 256;
const XORSHIFT_SEED_MIX = 0x9e3779b9;
const XORSHIFT_A = 13;
const XORSHIFT_B = 17;
const XORSHIFT_C = 5;
const TRACEPARENT_TRACE_SEGMENT = 1;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const TRACEPARENT_PATTERN = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i;

function defaultRandomBytes(bytes: Uint8Array): Uint8Array {
  const webCrypto = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (isValueDefined(webCrypto) && typeof webCrypto.getRandomValues === 'function')
    {return webCrypto.getRandomValues(bytes);}
  return fillFromXorshift(bytes);
}

let xorshiftState = (Date.now() ^ XORSHIFT_SEED_MIX) >>> 0 || 1;

function nextXorshift(): number {
  xorshiftState ^= xorshiftState << XORSHIFT_A;
  xorshiftState ^= xorshiftState >>> XORSHIFT_B;
  xorshiftState ^= xorshiftState << XORSHIFT_C;
  xorshiftState >>>= 0;
  return xorshiftState;
}

function fillFromXorshift(bytes: Uint8Array): Uint8Array {
  for (let index = 0; index < bytes.length; index++) {bytes[index] = nextXorshift() % BYTE_RANGE;}
  return bytes;
}

function randomHexId(byteCount: number, random: RandomBytesSource): string {
  const bytes = random(new Uint8Array(byteCount));
  if (bytes.every((byte) => byte === 0)) {bytes[byteCount - 1] = 1;}
  return Array.from(bytes, (byte) => byte.toString(HEX_RADIX).padStart(HEX_PAD, '0')).join('');
}

/** Builds a new W3C `traceparent` value (version 00, sampled) with fresh trace and span ids. */
export function createTraceparent(random: RandomBytesSource = defaultRandomBytes): string {
  const traceId = randomHexId(TRACE_ID_BYTES, random);
  const spanId = randomHexId(SPAN_ID_BYTES, random);
  return `${TRACEPARENT_VERSION}-${traceId}-${spanId}-${TRACEPARENT_SAMPLED_FLAGS}`;
}

function attachTraceparent(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (!config.headers.has(TRACEPARENT_HEADER)) {config.headers.set(TRACEPARENT_HEADER, createTraceparent());}
  return config;
}

/** Sends a fresh W3C `traceparent` on every request that does not already carry one. */
export function registerTraceparentInterceptor(instance: AxiosInstance): number {
  return instance.interceptors.request.use(attachTraceparent);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (isValueDefined(value) && typeof value === 'object') {return value as Record<string, unknown>;}
  return undefined;
}

function readHeader(headers: unknown, key: string): string | undefined {
  const value: unknown = asRecord(headers)?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') {return undefined;}
  const fromTraceparent = TRACEPARENT_PATTERN.exec(value)?.[TRACEPARENT_TRACE_SEGMENT];
  if (isValueDefined(fromTraceparent)) {return fromTraceparent;}
  return TRACE_ID_PATTERN.test(value) ? value : undefined;
}

/** Trace id of a failed request: response headers, then ProblemDetails `traceId`, then the sent `traceparent`. */
export function extractTraceId(error: unknown): string | undefined {
  const record = asRecord(error);
  if (record?.isAxiosError !== true) {return undefined;}
  const response = asRecord(record.response);
  const config = asRecord(record.config);
  return (
    toTraceId(readHeader(response?.headers, TRACEPARENT_HEADER)) ??
    toTraceId(readHeader(response?.headers, TRACE_ID_HEADER)) ??
    toTraceId(asRecord(response?.data)?.traceId) ??
    toTraceId(readHeader(config?.headers, TRACEPARENT_HEADER))
  );
}
