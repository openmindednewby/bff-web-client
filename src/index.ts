/**
 * `@dloizides/bff-web-client` — product-agnostic RN-web BFF HTTP layer.
 *
 * Owns the axios instance factory + the interceptor chain (logging, success
 * toast normalizer, error classifier) that erevna-web and katalogos-web shared
 * byte-for-byte. App-specific concerns are **ports** the consumer supplies:
 * its logger, its toast emitter, its CSRF strategy, and its session-expiry
 * handler. This package never imports a product, realm, or hardcoded URL.
 *
 * Surface:
 *   • `createBffAxiosClient(opts)` — credentialed axios instance, no interceptors
 *   • `registerInterceptors(instance, ports)` — wires the chain in BFF order
 *   • `registerDefaultCsrfInterceptor` — the default `csrf` port impl
 *   • individual interceptor registrars for selective use
 *   • the port/option types
 */

export { createBffAxiosClient } from './createBffAxiosClient';
export { registerInterceptors } from './registerInterceptors';

// Individual interceptor registrars (selective use / custom chains)
export { registerLoggingInterceptor } from './interceptors/loggingInterceptor';
export { registerResponseNormalizer } from './interceptors/responseNormalizer';
export {
  registerErrorClassifier,
  classifyError,
  handleResponseError,
} from './interceptors/errorClassifierInterceptor';
export {
  registerDefaultCsrfInterceptor,
  attachCsrfHeader,
} from './interceptors/defaultCsrfInterceptor';
export {
  registerWarmupRetryInterceptor,
  DEFAULT_RETRYABLE_STATUSES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_DELAY_MS,
} from './interceptors/warmupRetryInterceptor';

// Ports + option types
export type {
  BffLogger,
  EmitToast,
  InterceptorRegistrar,
  BffAxiosClientOptions,
  RegisterInterceptorsPorts,
  WarmupRetryConfig,
  WarmupRetryInfo,
} from './types';
