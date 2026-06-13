/**
 * Default CSRF request interceptor.
 *
 * After a BFF cutover, an SPA authenticates via a cookie. Cookie auth
 * reintroduces CSRF risk, so the BFF's `Bff.AspNetCore` anti-forgery
 * middleware requires a custom header on every state-changing request — a
 * request a cross-site form POST cannot forge. This default attaches
 * `X-BFF-Csrf: 1` to all mutating methods.
 *
 * This is the **default implementation of the `csrf` port**. Apps that need a
 * different CSRF strategy supply their own registrar to
 * {@link registerInterceptors}; this body is what diverged per app and is kept
 * overridable on purpose.
 */

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

/** Header name + value the `Bff.AspNetCore` anti-forgery middleware checks. */
const CSRF_HEADER = 'X-BFF-Csrf';
const CSRF_HEADER_VALUE = '1';

/** Methods the BFF anti-forgery middleware treats as state-changing. */
const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function isStateChanging(method: string | undefined): boolean {
  if (typeof method !== 'string') {
    return false;
  }
  return STATE_CHANGING_METHODS.includes(method.toUpperCase());
}

/**
 * Adds `X-BFF-Csrf` to every state-changing request. Safe (GET/HEAD) requests
 * are left untouched — the BFF only enforces the header on mutations.
 */
function attachCsrfHeader(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (isStateChanging(config.method)) {
    config.headers.set(CSRF_HEADER, CSRF_HEADER_VALUE);
  }
  return config;
}

/**
 * Registers the default CSRF request interceptor on an axios instance.
 * @returns The interceptor ID for potential ejection.
 */
function registerDefaultCsrfInterceptor(instance: AxiosInstance): number {
  return instance.interceptors.request.use(attachCsrfHeader);
}

export { registerDefaultCsrfInterceptor, attachCsrfHeader };
