/**
 * Shared types for `@dloizides/bff-web-client`.
 *
 * The package owns the BFF HTTP *logic* (the axios factory + the interceptor
 * chain). Every app-specific concern is a **port** the consuming app supplies:
 * its logger, its toast/UI bus, its CSRF strategy, and its session-expiry
 * handler. The package never imports a product, realm, or hardcoded URL.
 */

import type { ErrorSeverity } from '@dloizides/api-client-base';
import type { AxiosInstance } from 'axios';

/**
 * Minimal structured logger contract. The consuming app supplies an adapter
 * over its own logging service so the package emits no `console` calls.
 */
export interface BffLogger {
  debug: (context: string, message: string, data?: unknown) => void;
  info: (context: string, message: string, data?: unknown) => void;
  warn: (context: string, message: string, data?: unknown) => void;
  error: (context: string, message: string, error?: unknown) => void;
}

/**
 * Emits a UI toast. The app owns its UI event bus; the package only calls
 * this port when a mutating request succeeds (the response normalizer).
 */
export type EmitToast = (message: string, severity: ErrorSeverity) => void;

/**
 * Registers an interceptor on the given axios instance. Both the CSRF port and
 * the session-expiry port have this shape: the app supplies a function that
 * wires its own interceptor onto the instance. The package calls it during
 * {@link registerInterceptors} in the correct chain position.
 */
export type InterceptorRegistrar = (instance: AxiosInstance) => void;

/**
 * Options for {@link createBffAxiosClient}.
 */
export interface BffAxiosClientOptions {
  /** Request timeout in milliseconds. */
  timeoutMs: number;
  /** Optional base URL; omit to use relative paths (the BFF same-origin case). */
  baseURL?: string;
  /** Extra default headers merged over the BFF defaults. */
  headers?: Record<string, string>;
}

/**
 * Ports for {@link registerInterceptors}. The 4 package-owned interceptors
 * (logging, response normalizer, error classifier) run with the supplied
 * {@link BffLogger} and {@link EmitToast}; `csrf` and `onSessionExpiry` are
 * app-supplied registrars wired into the chain at the right position.
 */
export interface RegisterInterceptorsPorts {
  /** Structured logger the package logs through. */
  logger: BffLogger;
  /** Toast emitter the response normalizer calls on a successful mutation. */
  emitToast: EmitToast;
  /**
   * App-supplied CSRF request-interceptor registrar (the one body that
   * diverges per app). If omitted, {@link registerDefaultCsrfInterceptor} is
   * used, which attaches `X-BFF-Csrf: 1` to every state-changing request.
   */
  csrf?: InterceptorRegistrar;
  /**
   * App-supplied session-expiry response-interceptor registrar (the app owns
   * its session store + its `/bff/me` probe). Optional: omit when an app does
   * not handle 401 session death in the HTTP layer.
   */
  onSessionExpiry?: InterceptorRegistrar;
}
