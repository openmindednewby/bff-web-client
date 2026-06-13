/**
 * Request and response logging interceptor.
 *
 * Logs HTTP method, URL, status, and duration through the app-supplied
 * {@link BffLogger}. Only active in non-production environments. Request
 * bodies are NOT logged for security reasons.
 */

import { isValueDefined } from '@dloizides/utils';

import type { BffLogger } from '../types';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const LOG_CONTEXT = 'http';
const REQUEST_START_HEADER = 'x-request-start-time';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Logs the outgoing request and stamps the start time for duration tracking.
 */
function logRequest(
  config: InternalAxiosRequestConfig,
  logger: BffLogger,
): InternalAxiosRequestConfig {
  if (isProduction()) {
    return config;
  }

  const method = (config.method ?? 'GET').toUpperCase();
  const url = config.url ?? 'unknown';

  logger.debug(LOG_CONTEXT, `-> ${method} ${url}`);

  config.headers.set(REQUEST_START_HEADER, String(Date.now()));

  return config;
}

function calculateDurationMs(config: InternalAxiosRequestConfig): number | undefined {
  const startRaw = config.headers.get(REQUEST_START_HEADER);
  if (typeof startRaw !== 'string' || startRaw.length === 0) {
    return undefined;
  }

  const start = Number(startRaw);
  if (Number.isNaN(start)) {
    return undefined;
  }

  return Date.now() - start;
}

/**
 * Logs successful responses with status and duration.
 */
function logResponse(response: AxiosResponse, logger: BffLogger): AxiosResponse {
  if (isProduction()) {
    return response;
  }

  const method = (response.config.method ?? 'GET').toUpperCase();
  const url = response.config.url ?? 'unknown';
  const status = response.status;
  const duration = calculateDurationMs(response.config);

  const durationSuffix = isValueDefined(duration) ? ` (${duration}ms)` : '';
  logger.debug(LOG_CONTEXT, `<- ${method} ${url} ${status}${durationSuffix}`);

  return response;
}

interface AxiosLikeError {
  config: InternalAxiosRequestConfig;
  response?: AxiosResponse;
  message?: string;
}

function isAxiosLikeError(value: unknown): value is AxiosLikeError {
  if (typeof value !== 'object') {
    return false;
  }
  if (!isValueDefined(value)) {
    return false;
  }
  return 'config' in value;
}

/**
 * Logs error responses with status and duration.
 */
async function logErrorResponse(error: unknown, logger: BffLogger): Promise<never> {
  if (isProduction()) {
    return Promise.reject(error);
  }
  if (!isAxiosLikeError(error)) {
    return Promise.reject(error);
  }

  const method = (error.config.method ?? 'GET').toUpperCase();
  const url = error.config.url ?? 'unknown';
  const status = error.response?.status ?? 0;
  const duration = calculateDurationMs(error.config);

  const durationSuffix = isValueDefined(duration) ? ` (${duration}ms)` : '';
  logger.warn(LOG_CONTEXT, `<- ${method} ${url} ${status}${durationSuffix}`);

  return Promise.reject(error);
}

/**
 * Registers request and response logging interceptors on an axios instance.
 * No-ops in production.
 * @returns An object with both interceptor IDs for potential ejection.
 */
function registerLoggingInterceptor(
  instance: AxiosInstance,
  logger: BffLogger,
): { request: number; response: number } {
  const requestId = instance.interceptors.request.use((config) => logRequest(config, logger));
  const responseId = instance.interceptors.response.use(
    (response) => logResponse(response, logger),
    (error: unknown) => logErrorResponse(error, logger),
  );
  return { request: requestId, response: responseId };
}

export { registerLoggingInterceptor };
