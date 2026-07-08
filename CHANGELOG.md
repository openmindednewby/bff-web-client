# Changelog

All notable changes to `@dloizides/bff-web-client` are documented here.

## [1.1.0] - 2026-07-05

### Added
- `registerWarmupRetryInterceptor` — retries transient cold-start `502/503/504`
  gateway failures (upstream not ready = request not processed) with exponential
  backoff, so the first `/bff/me` probe after idle no longer surfaces an
  auth-error / anonymous flash (P1-06). Wired FIRST in the response chain by
  `registerInterceptors` so it resolves before any downstream interceptor sees
  the error. Opt out or tune via the new `warmupRetry` port
  (`WarmupRetryConfig | false`; defaults: 3 retries, 400ms base, [502,503,504]).
  `401`/`4xx`/`500` are never retried.

## [1.0.0] - 2026-06-14

### Added
- Initial release. Extracted from the byte-identical BFF HTTP layer shared by
  `erevna-web` and `katalogos-web`.
- `createBffAxiosClient(opts)` — credentialed axios instance factory with the
  shared BFF defaults (JSON, `X-Requested-With`, `withCredentials`).
- `registerInterceptors(instance, ports)` — wires the BFF interceptor chain:
  logging, success-toast normalizer, error classifier (package-owned), plus the
  app-supplied `csrf` and `onSessionExpiry` ports.
- Individual interceptor registrars: `registerLoggingInterceptor`,
  `registerResponseNormalizer`, `registerErrorClassifier`,
  `registerDefaultCsrfInterceptor`.
- Ports/types: `BffLogger`, `EmitToast`, `InterceptorRegistrar`,
  `BffAxiosClientOptions`, `RegisterInterceptorsPorts`.
