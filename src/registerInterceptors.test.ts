import { registerInterceptors } from './registerInterceptors';

import type { BffLogger, EmitToast } from './types';
import type { AxiosInstance } from 'axios';

function makeLogger(): BffLogger {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function makeInstance(): { instance: AxiosInstance; requestUse: jest.Mock; responseUse: jest.Mock } {
  const requestUse = jest.fn().mockReturnValue(0);
  const responseUse = jest.fn().mockReturnValue(0);
  const instance = {
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  } as unknown as AxiosInstance;
  return { instance, requestUse, responseUse };
}

describe('registerInterceptors', () => {
  const logger = makeLogger();
  const emitToast: EmitToast = jest.fn();

  it('registers the default CSRF interceptor when no csrf port is supplied', () => {
    const { instance, requestUse, responseUse } = makeInstance();

    registerInterceptors(instance, { logger, emitToast });

    // logging registers one request interceptor + default csrf registers one => 2 request interceptors
    expect(requestUse).toHaveBeenCalledTimes(2);
    // logging response + normalizer + error classifier => 3 response interceptors (no session expiry)
    expect(responseUse).toHaveBeenCalledTimes(3);
  });

  it('uses the app-supplied csrf port instead of the default', () => {
    const { instance, requestUse } = makeInstance();
    const csrf = jest.fn();

    registerInterceptors(instance, { logger, emitToast, csrf });

    expect(csrf).toHaveBeenCalledWith(instance);
    // only the logging request interceptor registers via the instance; csrf is the port
    expect(requestUse).toHaveBeenCalledTimes(1);
  });

  it('invokes the onSessionExpiry port when supplied', () => {
    const { instance } = makeInstance();
    const onSessionExpiry = jest.fn();

    registerInterceptors(instance, { logger, emitToast, onSessionExpiry });

    expect(onSessionExpiry).toHaveBeenCalledWith(instance);
  });

  it('wires both ports together', () => {
    const { instance } = makeInstance();
    const csrf = jest.fn();
    const onSessionExpiry = jest.fn();

    registerInterceptors(instance, { logger, emitToast, csrf, onSessionExpiry });

    expect(csrf).toHaveBeenCalledWith(instance);
    expect(onSessionExpiry).toHaveBeenCalledWith(instance);
  });
});
