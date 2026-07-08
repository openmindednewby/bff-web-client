/**
 * Response error interceptor: transparently retries transient warm-up failures.
 *
 * WHY (P1-06): on a resource-tight, scale-to-zero prod node the BFF (or its
 * upstream API) can be cold on the FIRST request after idle — the gateway answers
 * `502/503/504` for a few seconds while the upstream comes up, then settles to a
 * correct `401/200`. The unguarded `/bff/me` probe surfaced that transient as an
 * auth error / anonymous flash on first load. These statuses mean the request was
 * NOT processed (upstream unavailable), so retrying is safe for any method.
 *
 * This interceptor catches those statuses and re-issues the SAME request up to
 * `maxRetries` times with exponential backoff, BEFORE the error classifier turns
 * it into a surfaced error — so it must be registered FIRST in the response
 * chain. `4xx` (incl. 401) and `500` fall straight through: a 500 is a real
 * server error, not a warm-up, and must not be retried.
 *
 * Deterministic + timer-injectable: the backoff `sleep` is a port (defaults to
 * `setTimeout`) so unit tests resolve instantly and no jitter/`Math.random` is
 * used.
 */

import type { BffLogger, WarmupRetryConfig } from '../types';
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const LOG_CONTEXT = 'warmupRetry';

/** Gateway/upstream-not-ready statuses that mean "request not processed → safe to retry". */
const DEFAULT_RETRYABLE_STATUSES: readonly number[] = [502, 503, 504];
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 400;
const BACKOFF_FACTOR = 2;

/** Per-request attempt counter stashed on the axios config. */
interface RetryableConfig extends InternalAxiosRequestConfig {
  __warmupRetryCount?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAxiosError(value: unknown): value is AxiosError {
  return typeof value === 'object' && value !== null && 'isAxiosError' in value;
}

/**
 * Registers the warm-up retry interceptor. Returns the interceptor ID for ejection.
 */
function registerWarmupRetryInterceptor(
  instance: AxiosInstance,
  logger: BffLogger,
  config: WarmupRetryConfig = {},
): number {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const retryableStatuses = config.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;
  const sleep = config.sleep ?? defaultSleep;
  const onWarmupRetry = config.onWarmupRetry;

  return instance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!isAxiosError(error) || error.response === undefined) {
        return Promise.reject(error);
      }
      if (!retryableStatuses.includes(error.response.status)) {
        return Promise.reject(error);
      }

      const requestConfig = error.config as RetryableConfig | undefined;
      if (requestConfig === undefined) {
        return Promise.reject(error);
      }

      const attempt = (requestConfig.__warmupRetryCount ?? 0) + 1;
      if (attempt > maxRetries) {
        logger.warn(LOG_CONTEXT, `gave up after ${maxRetries} warm-up retries`, {
          url: requestConfig.url,
          status: error.response.status,
        });
        return Promise.reject(error);
      }

      requestConfig.__warmupRetryCount = attempt;
      const delayMs = baseDelayMs * BACKOFF_FACTOR ** (attempt - 1);
      logger.debug(LOG_CONTEXT, `upstream warming up — retry ${attempt}/${maxRetries} in ${delayMs}ms`, {
        url: requestConfig.url,
        status: error.response.status,
      });
      // Surface the warm-up to the app so it can show a "warming up…" state
      // WHILE we retry (UX Move 3). Never let a UI callback break the retry.
      if (onWarmupRetry !== undefined) {
        try {
          onWarmupRetry({
            attempt,
            maxRetries,
            delayMs,
            status: error.response.status,
            url: requestConfig.url,
          });
        } catch (callbackError) {
          logger.warn(LOG_CONTEXT, 'onWarmupRetry callback threw', callbackError);
        }
      }
      await sleep(delayMs);
      return instance.request(requestConfig);
    },
  );
}

export {
  registerWarmupRetryInterceptor,
  DEFAULT_RETRYABLE_STATUSES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_DELAY_MS,
};
