import { registerLoggingInterceptor } from './loggingInterceptor';

import type { BffLogger } from '../types';
import type { AxiosInstance } from 'axios';

function makeLogger(): jest.Mocked<BffLogger> {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

interface HeaderStore {
  set: jest.Mock;
  get: jest.Mock;
}

function makeHeaders(initial: Record<string, string> = {}): HeaderStore {
  const store: Record<string, string> = { ...initial };
  return {
    set: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    get: jest.fn((key: string) => store[key]),
  };
}

interface RegisteredHandlers {
  onRequest: (config: unknown) => unknown;
  onResponse: (response: unknown) => unknown;
  onError: (error: unknown) => Promise<never>;
}

function register(logger: BffLogger): { handlers: RegisteredHandlers; requestUse: jest.Mock; responseUse: jest.Mock } {
  const requestUse = jest.fn().mockReturnValue(1);
  const responseUse = jest.fn().mockReturnValue(2);
  const instance = {
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  } as unknown as AxiosInstance;

  const ids = registerLoggingInterceptor(instance, logger);
  expect(ids).toEqual({ request: 1, response: 2 });

  return {
    requestUse,
    responseUse,
    handlers: {
      onRequest: requestUse.mock.calls[0][0] as (config: unknown) => unknown,
      onResponse: responseUse.mock.calls[0][0] as (response: unknown) => unknown,
      onError: responseUse.mock.calls[0][1] as (error: unknown) => Promise<never>,
    },
  };
}

describe('loggingInterceptor (non-production)', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('logs the outgoing request and stamps a start time', () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders();

    const config = { method: 'post', url: '/api/x', headers };
    const result = handlers.onRequest(config);

    expect(result).toBe(config);
    expect(logger.debug).toHaveBeenCalledWith('http', '-> POST /api/x');
    expect(headers.set).toHaveBeenCalledWith('x-request-start-time', expect.any(String));
  });

  it('defaults method and url when missing', () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders();

    handlers.onRequest({ headers });

    expect(logger.debug).toHaveBeenCalledWith('http', '-> GET unknown');
  });

  it('logs the response with a computed duration', () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders({ 'x-request-start-time': String(Date.now() - 5) });

    const response = { status: 200, config: { method: 'get', url: '/api/x', headers } };
    const result = handlers.onResponse(response);

    expect(result).toBe(response);
    expect(logger.debug).toHaveBeenCalledWith('http', expect.stringMatching(/^<- GET \/api\/x 200 \(\d+ms\)$/));
  });

  it('defaults method and url on the response when missing', () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders();

    handlers.onResponse({ status: 200, config: { headers } });

    expect(logger.debug).toHaveBeenCalledWith('http', '<- GET unknown 200');
  });

  it('defaults method and url on the error when missing', async () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders();

    const error = { config: { headers }, response: { status: 503 } };
    await expect(handlers.onError(error)).rejects.toBe(error);
    expect(logger.warn).toHaveBeenCalledWith('http', '<- GET unknown 503');
  });

  it('omits the duration suffix when no start time was stamped', () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders();

    handlers.onResponse({ status: 204, config: { method: 'delete', url: '/api/y', headers } });

    expect(logger.debug).toHaveBeenCalledWith('http', '<- DELETE /api/y 204');
  });

  it('omits the duration suffix when the start time is not numeric', () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders({ 'x-request-start-time': 'not-a-number' });

    handlers.onResponse({ status: 200, config: { method: 'get', url: '/api/z', headers } });

    expect(logger.debug).toHaveBeenCalledWith('http', '<- GET /api/z 200');
  });

  it('logs and rejects error responses', async () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders({ 'x-request-start-time': String(Date.now() - 3) });

    const error = { config: { method: 'post', url: '/api/err', headers }, response: { status: 500 } };
    await expect(handlers.onError(error)).rejects.toBe(error);
    expect(logger.warn).toHaveBeenCalledWith('http', expect.stringContaining('<- POST /api/err 500'));
  });

  it('defaults the error status to 0 when no response', async () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders();

    const error = { config: { method: 'get', url: '/api/down', headers } };
    await expect(handlers.onError(error)).rejects.toBe(error);
    expect(logger.warn).toHaveBeenCalledWith('http', '<- GET /api/down 0');
  });

  it('rejects non-axios-like errors without logging', async () => {
    const logger = makeLogger();
    const { handlers } = register(logger);

    await expect(handlers.onError('boom')).rejects.toBe('boom');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rejects null errors without logging', async () => {
    const logger = makeLogger();
    const { handlers } = register(logger);

    await expect(handlers.onError(null)).rejects.toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('loggingInterceptor (production)', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('no-ops the request handler', () => {
    const logger = makeLogger();
    const { handlers } = register(logger);
    const headers = makeHeaders();

    const config = { method: 'post', url: '/api/x', headers };
    expect(handlers.onRequest(config)).toBe(config);
    expect(logger.debug).not.toHaveBeenCalled();
    expect(headers.set).not.toHaveBeenCalled();
  });

  it('no-ops the response handler', () => {
    const logger = makeLogger();
    const { handlers } = register(logger);

    const response = { status: 200, config: { method: 'get', url: '/api/x', headers: makeHeaders() } };
    expect(handlers.onResponse(response)).toBe(response);
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('no-ops the error handler but still rejects', async () => {
    const logger = makeLogger();
    const { handlers } = register(logger);

    const error = { config: { method: 'get', url: '/api/x', headers: makeHeaders() }, response: { status: 500 } };
    await expect(handlers.onError(error)).rejects.toBe(error);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
