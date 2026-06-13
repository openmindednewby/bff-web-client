import { registerDefaultCsrfInterceptor, attachCsrfHeader } from './defaultCsrfInterceptor';

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

function makeConfig(method: string | undefined): InternalAxiosRequestConfig {
  const set = jest.fn();
  return {
    method,
    headers: { set } as unknown as InternalAxiosRequestConfig['headers'],
  } as InternalAxiosRequestConfig;
}

describe('attachCsrfHeader', () => {
  it('attaches the CSRF header for state-changing methods', () => {
    const config = makeConfig('post');
    attachCsrfHeader(config);
    expect((config.headers.set as jest.Mock)).toHaveBeenCalledWith('X-BFF-Csrf', '1');
  });

  it.each(['put', 'patch', 'delete'])('attaches the CSRF header for %s', (method) => {
    const config = makeConfig(method);
    attachCsrfHeader(config);
    expect((config.headers.set as jest.Mock)).toHaveBeenCalledWith('X-BFF-Csrf', '1');
  });

  it('does not attach the header for GET', () => {
    const config = makeConfig('get');
    attachCsrfHeader(config);
    expect((config.headers.set as jest.Mock)).not.toHaveBeenCalled();
  });

  it('does not attach the header when method is undefined', () => {
    const config = makeConfig(undefined);
    attachCsrfHeader(config);
    expect((config.headers.set as jest.Mock)).not.toHaveBeenCalled();
  });
});

describe('registerDefaultCsrfInterceptor', () => {
  it('registers a request interceptor and returns its id', () => {
    const use = jest.fn().mockReturnValue(7);
    const instance = { interceptors: { request: { use } } } as unknown as AxiosInstance;

    const id = registerDefaultCsrfInterceptor(instance);

    expect(use).toHaveBeenCalledTimes(1);
    expect(id).toBe(7);
  });
});
