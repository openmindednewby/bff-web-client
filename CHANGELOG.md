# Changelog

All notable changes to `@dloizides/bff-web-client` are documented here.

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
