# @dloizides/bff-web-client

Product-agnostic RN-web **BFF HTTP layer** for the dloizides.com portfolio.

It owns the axios instance factory and the interceptor chain (logging, success
toast normalizer, error classifier) that `erevna-web` and `katalogos-web` shared
byte-for-byte. Every app-specific concern is a **port** the consuming app
supplies — its logger, its toast emitter, its CSRF strategy, and its
session-expiry handler. The package never imports a product, realm, or hardcoded
URL, and pairs with `@dloizides/api-client-base` by composition.

## Install

```bash
npm install @dloizides/bff-web-client
```

Peer deps: `axios`, `@dloizides/api-client-base`, `@dloizides/utils`.

## Usage

```ts
import {
  createBffAxiosClient,
  registerInterceptors,
} from '@dloizides/bff-web-client';

import { apiEventBus } from '@dloizides/api-client-base';
import { logger } from './my-logger';
import { registerCsrfInterceptor } from './csrfInterceptor'; // app-owned
import { registerSessionExpiryInterceptor } from './sessionExpiry'; // app-owned

export const apiClient = createBffAxiosClient({ timeoutMs: 30_000 });

registerInterceptors(apiClient, {
  logger,
  emitToast: (message, severity) =>
    apiEventBus.emit({ type: 'toast', severity, message }),
  csrf: registerCsrfInterceptor,
  onSessionExpiry: registerSessionExpiryInterceptor,
});
```

## API

### `createBffAxiosClient(options)`

| option      | type                       | description                                          |
| ----------- | -------------------------- | ---------------------------------------------------- |
| `timeoutMs` | `number`                   | Request timeout in milliseconds.                     |
| `baseURL`   | `string` (optional)        | Omit for same-origin (relative) BFF requests.        |
| `headers`   | `Record<string,string>`    | Extra default headers merged over the BFF defaults.  |

Returns a credentialed `AxiosInstance` with **no** interceptors registered.

### `registerInterceptors(instance, ports)`

| port             | type                                   | required | description                                                          |
| ---------------- | -------------------------------------- | -------- | -------------------------------------------------------------------- |
| `logger`         | `BffLogger`                            | yes      | Structured logger the package logs through.                          |
| `emitToast`      | `(message, severity) => void`          | yes      | Called when a mutating request succeeds.                            |
| `csrf`           | `(instance) => void`                   | no       | App CSRF registrar. Defaults to `X-BFF-Csrf: 1` on mutations.        |
| `onSessionExpiry`| `(instance) => void`                   | no       | App session-expiry registrar (app owns its session store).          |

Chain order (matches the pre-extraction behaviour):

- **Request** (reverse execution): logging is registered first (runs last),
  CSRF registered second (runs first).
- **Response** (execution order): logging → normalizer → session expiry →
  error classifier.

### Individual registrars

`registerLoggingInterceptor`, `registerResponseNormalizer`,
`registerErrorClassifier`, `registerDefaultCsrfInterceptor` — exported for
custom chains.

## License

MIT
