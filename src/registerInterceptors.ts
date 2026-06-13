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
 *   1. logging          (logs response/error first)
 *   2. normalizer       (emits success toast)
 *   3. session expiry   (handles 401 -> clear session, app-supplied port)
 *   4. error classifier (classifies remaining errors)
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

import type { RegisterInterceptorsPorts } from './types';
import type { AxiosInstance } from 'axios';

/**
 * Registers the full BFF interceptor chain on the provided axios instance.
 * Call this once during application bootstrap after creating the instance.
 */
function registerInterceptors(instance: AxiosInstance, ports: RegisterInterceptorsPorts): void {
  const { logger, emitToast, csrf, onSessionExpiry } = ports;

  // Request interceptors (registered order = reverse execution order)
  registerLoggingInterceptor(instance, logger);
  if (csrf) {
    csrf(instance);
  } else {
    registerDefaultCsrfInterceptor(instance);
  }

  // Response interceptors (registered order = execution order)
  registerResponseNormalizer(instance, emitToast, logger);
  if (onSessionExpiry) {
    onSessionExpiry(instance);
  }
  registerErrorClassifier(instance, logger);
}

export { registerInterceptors };
