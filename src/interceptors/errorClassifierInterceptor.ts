/**
 * Response error interceptor: classifies axios errors.
 *
 * Converts raw AxiosError objects into {@link ClassifiedError} instances with
 * full context (status, url, method, errorCode, message, etc), logs them
 * through the app-supplied {@link BffLogger}, and re-rejects so callers and
 * downstream interceptors can react.
 */

import { HttpMethod } from '@dloizides/api-client-base';
import { isValueDefined } from '@dloizides/utils';

import type { BffLogger } from '../types';
import type { ClassifiedError } from '@dloizides/api-client-base';
import type { AxiosError, AxiosInstance, AxiosResponse } from 'axios';

const LOG_CONTEXT = 'errorClassifier';
const TIMEOUT_ERROR_CODE = 'ECONNABORTED';
const NETWORK_ERROR_STATUS = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return isValueDefined(value) && typeof value === 'object';
}

function isAxiosError(value: unknown): value is AxiosError {
  if (typeof value !== 'object') {
    return false;
  }
  if (!isValueDefined(value)) {
    return false;
  }
  return 'isAxiosError' in value;
}

function extractErrorCode(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const code = data.errorCode ?? data.code ?? data.error;
  if (typeof code === 'string' && code.length > 0) {
    return code;
  }

  return undefined;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (!isRecord(data)) {
    return fallback;
  }

  const message = data.message ?? data.detail ?? data.error ?? data.title;
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }

  return fallback;
}

function extractStringHeader(headers: Record<string, unknown>, key: string): string | undefined {
  const value: unknown = headers[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
}

function extractRequestId(response: AxiosResponse | undefined): string | undefined {
  if (!isValueDefined(response)) {
    return undefined;
  }

  const headers = response.headers;
  if (!isRecord(headers)) {
    return undefined;
  }

  return extractStringHeader(headers, 'x-request-id') ?? extractStringHeader(headers, 'x-correlation-id');
}

function resolveHttpMethod(method: string | undefined): HttpMethod {
  if (typeof method !== 'string') {
    return HttpMethod.Get;
  }
  const upper = method.toUpperCase();
  const methodMap: Record<string, HttpMethod | undefined> = {
    GET: HttpMethod.Get,
    POST: HttpMethod.Post,
    PUT: HttpMethod.Put,
    PATCH: HttpMethod.Patch,
    DELETE: HttpMethod.Delete,
  };
  return methodMap[upper] ?? HttpMethod.Get;
}

/**
 * Converts an AxiosError into a {@link ClassifiedError} with full context.
 */
function classifyError(error: AxiosError): ClassifiedError {
  const response = error.response;
  const hasResponse = isValueDefined(response);

  const status = hasResponse ? response.status : NETWORK_ERROR_STATUS;
  const url = error.config?.url ?? 'unknown';
  const method = resolveHttpMethod(error.config?.method);
  const body = hasResponse ? response.data : undefined;

  const isTimeout = error.code === TIMEOUT_ERROR_CODE;
  const defaultMessage = isTimeout ? 'Request timed out' : 'Network error';
  const errorCode = extractErrorCode(body) ?? (isTimeout ? TIMEOUT_ERROR_CODE : undefined);
  const message = hasResponse ? extractErrorMessage(body, error.message) : defaultMessage;

  return {
    status,
    url,
    method,
    errorCode,
    message,
    body,
    originalError: error,
    timestamp: Date.now(),
    requestId: extractRequestId(response),
  };
}

/**
 * Handles response errors by classifying them and logging.
 */
async function handleResponseError(error: unknown, logger: BffLogger): Promise<never> {
  if (!isAxiosError(error)) {
    return Promise.reject(error);
  }

  const classified = classifyError(error);

  logger.warn(LOG_CONTEXT, `HTTP ${classified.method} ${classified.url} failed`, {
    status: classified.status,
    errorCode: classified.errorCode,
    message: classified.message,
  });

  return Promise.reject(error);
}

/**
 * Registers the error classifier interceptor on an axios instance.
 * @returns The interceptor ID for potential ejection.
 */
function registerErrorClassifier(instance: AxiosInstance, logger: BffLogger): number {
  return instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => handleResponseError(error, logger),
  );
}

export { registerErrorClassifier, classifyError, handleResponseError };
