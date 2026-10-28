import { extractTraceId } from '../tracing/traceContext';
import { ClientErrorLevel } from './clientErrorTypes';
import type { ClientErrorPayload } from './clientErrorTypes';

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_STACK_LENGTH = 8000;
export const MAX_PAGE_LENGTH = 500;
export const UNKNOWN_ERROR_MESSAGE = 'Unknown error';

interface ErrorParts {
  message: string;
  stack?: string;
  traceId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function stringify(value: unknown): string | undefined {
  try {
    return nonEmptyString(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function messageOf(error: unknown): string {
  const text = nonEmptyString(error);
  if (text !== undefined) {return text;}
  const record = asRecord(error);
  if (record !== undefined) {return nonEmptyString(record.message) ?? stringify(error) ?? UNKNOWN_ERROR_MESSAGE;}
  const isMissing = error === undefined || error === null || error === '';
  return isMissing ? UNKNOWN_ERROR_MESSAGE : String(error);
}

function traceIdOf(error: unknown): string | undefined {
  return nonEmptyString(asRecord(error)?.traceId) ?? extractTraceId(error);
}

/** Reads message, stack and trace id from any thrown value, never throwing itself. */
export function describeError(error: unknown): ErrorParts {
  return {
    message: messageOf(error),
    stack: nonEmptyString(asRecord(error)?.stack),
    traceId: traceIdOf(error),
  };
}

function pathOnly(pathname: string): string {
  const cut = pathname.search(/[?#]/);
  return (cut === -1 ? pathname : pathname.slice(0, cut)).slice(0, MAX_PAGE_LENGTH);
}

/** Builds the contract payload: path-only page, every field truncated to its limit. */
export function buildClientErrorPayload(
  error: unknown,
  pathname: string,
  level: ClientErrorLevel = ClientErrorLevel.Error,
  appVersion?: string,
): ClientErrorPayload {
  const parts = describeError(error);
  const payload: ClientErrorPayload = {
    message: parts.message.slice(0, MAX_MESSAGE_LENGTH),
    page: pathOnly(pathname),
    level,
  };
  if (parts.stack !== undefined) {payload.stack = parts.stack.slice(0, MAX_STACK_LENGTH);}
  if (parts.traceId !== undefined) {payload.traceId = parts.traceId;}
  if (appVersion !== undefined && appVersion !== '') {payload.appVersion = appVersion;}
  return payload;
}
