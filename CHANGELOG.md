# Changelog

All notable changes to `@dloizides/bff-web-client` are documented here.

## [1.3.0] - 2026-09-06

### Added
- **Write-verb `Content-Type` guard** — `createBffAxiosClient` now registers
  `writeContentTypeGuard` on every instance, so the client is *incapable* of emitting a
  write without a correct content type: it sets one, or it throws naming the call site.

  The instance defaults already set `Content-Type: application/json` and were still
  defeated, because axios v1's XHR adapter does
  `if (requestData === undefined) headers.setContentType(null)` — it **strips** the header
  when a request has no body. A body-less `POST` therefore reached the server with no
  content type and got **415**, in production, at a venue door, while every automated check
  was green. The guard operates on the **body** (substituting `{}` for body-less writes),
  because guarding the header cannot work.

  FormData / Blob / ArrayBuffer / URLSearchParams bodies are detected and passed through
  untouched — the runtime must set `multipart/form-data` plus the boundary itself. This
  replaces the hand-rolled `headers: { 'Content-Type': undefined }` override that consuming
  apps were each maintaining separately.

- **`@dloizides/bff-web-client/testing`** — a new subpath exporting `captureWriteRequests`
  and `expectJsonWriteShape`, which pin method + Content-Type + body for every write verb
  against an app's OWN configured client. The 415 was catchable in milliseconds by a unit
  test; nothing asserted the request shape, in any app. Now every app inherits the assertion
  instead of re-deriving it.

### Notes
- No breaking API change; body-less writes now carry `{}` on the wire, which is what a
  server expecting JSON requires.
- See `BaseClient/docs/code-standards/evidence-and-gates.md`.

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
