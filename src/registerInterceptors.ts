/**
 * Interceptor registration — BFF era.
 *
 * Wires the interceptor chain onto an axios instance in the correct order.
 *
 * Request interceptors run in REVERSE order of registration, so:
 *   1. logging (registered first, runs last = logs the FINAL config)
 *   2. csrf    (registered second, runs first = attaches the CSRF header)
 *
 * Response interceptors run in ORDER of registration, so:
 *   1. warm-up retry    (retries transient 502/503/504 upstream-cold failures)
 *   2. logging          (logs response/error)
 *   3. normalizer       (emits success toast)
 *   4. session expiry   (handles 401 -> clear session, app-supplied port)
 *   5. error classifier (classifies remaining errors)
 *
 * The warm-up retry runs FIRST so a cold-start 502/503/504 is re-issued and
 * (usually) resolves before any downstream interceptor logs or surfaces it as
 * an error — the P1-06 "auth-error/anonymous flash on first load" fix.
 *
 * The package owns the logging, normalizer, and error-classifier bodies. The
 * `csrf` and `onSessionExpiry` registrars are app-supplied ports (the app owns
 * its CSRF strategy and its session store); `csrf` falls back to the package
 * default when omitted.
 */

import { registerDefaultCsrfInterceptor } from './interceptors/defaultCsrfInterceptor';
import { registerErrorClassifier } from './interceptors/errorClassifierInterceptor';
import { registerLoggingInterceptor } from './interceptors/loggingInterceptor';
import { registerResponseNormalizer } from './interceptors/responseNormalizer';
import { registerWarmupRetryInterceptor } from './interceptors/warmupRetryInterceptor';

import type { RegisterInterceptorsPorts } from './types';
import type { AxiosInstance } from 'axios';

/**
 * Registers the full BFF interceptor chain on the provided axios instance.
 * Call this once during application bootstrap after creating the instance.
 */
function registerInterceptors(instance: AxiosInstance, ports: RegisterInterceptorsPorts): void {
  const { logger, emitToast, csrf, onSessionExpiry, warmupRetry } = ports;

  // Request interceptors (registered order = reverse execution order)
  registerLoggingInterceptor(instance, logger);
  if (csrf) {
    csrf(instance);
  } else {
    registerDefaultCsrfInterceptor(instance);
  }

  // Response interceptors (registered order = execution order)
  // Warm-up retry runs FIRST so a cold-start 502/503/504 is retried before any
  // downstream interceptor surfaces it (P1-06). Pass `warmupRetry: false` to opt out.
  if (warmupRetry !== false) {
    registerWarmupRetryInterceptor(instance, logger, warmupRetry ?? {});
  }
  registerResponseNormalizer(instance, emitToast, logger);
  if (onSessionExpiry) {
    onSessionExpiry(instance);
  }
  registerErrorClassifier(instance, logger);
}

export { registerInterceptors };
