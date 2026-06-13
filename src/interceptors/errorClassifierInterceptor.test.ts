import {
  registerErrorClassifier,
  classifyError,
  handleResponseError,
} from './errorClassifierInterceptor';

import type { BffLogger } from '../types';
import type { AxiosError, AxiosInstance } from 'axios';

function makeLogger(): jest.Mocked<BffLogger> {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('classifyError', () => {
  it('classifies 4xx errors with status, url, and method', () => {
    const error = {
      isAxiosError: true,
      message: 'Request failed with status 404',
      config: { url: '/api/users/123', method: 'get' },
      response: { status: 404, data: { message: 'User not found' }, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.status).toBe(404);
    expect(classified.url).toBe('/api/users/123');
    expect(classified.method).toBe('GET');
    expect(classified.message).toBe('User not found');
  });

  it('classifies 5xx errors and reads the detail field', () => {
    const error = {
      isAxiosError: true,
      message: 'fail',
      config: { url: '/api/process', method: 'post' },
      response: { status: 500, data: { detail: 'Internal server error occurred' }, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.status).toBe(500);
    expect(classified.method).toBe('POST');
    expect(classified.message).toBe('Internal server error occurred');
  });

  it('classifies network errors with status 0', () => {
    const error = {
      isAxiosError: true,
      message: 'Network Error',
      config: { url: '/api/test', method: 'get' },
      response: undefined,
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.status).toBe(0);
    expect(classified.message).toBe('Network error');
  });

  it('classifies timeout errors', () => {
    const error = {
      isAxiosError: true,
      message: 'timeout',
      code: 'ECONNABORTED',
      config: { url: '/api/slow', method: 'get' },
      response: undefined,
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.errorCode).toBe('ECONNABORTED');
    expect(classified.message).toBe('Request timed out');
  });

  it('extracts error code from the response body', () => {
    const error = {
      isAxiosError: true,
      message: 'Forbidden',
      config: { url: '/api/premium', method: 'put' },
      response: { status: 403, data: { errorCode: 'FEATURE_GATED' }, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.errorCode).toBe('FEATURE_GATED');
    expect(classified.method).toBe('PUT');
  });

  it('extracts request id from headers (x-request-id then x-correlation-id)', () => {
    const error = {
      isAxiosError: true,
      message: 'Failed',
      config: { url: '/api/test', method: 'patch' },
      response: { status: 500, data: {}, headers: { 'x-correlation-id': 'corr-9' } },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.requestId).toBe('corr-9');
    expect(classified.method).toBe('PATCH');
  });

  it('defaults url to unknown and method to GET when config is missing', () => {
    const error = {
      isAxiosError: true,
      message: 'Failed',
      config: undefined,
      response: { status: 500, data: {}, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.url).toBe('unknown');
    expect(classified.method).toBe('GET');
  });

  it('maps the DELETE method', () => {
    const error = {
      isAxiosError: true,
      message: 'Failed',
      config: { url: '/api/x', method: 'delete' },
      response: { status: 500, data: {}, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.method).toBe('DELETE');
  });

  it('falls back to the axios message when the body has no message', () => {
    const error = {
      isAxiosError: true,
      message: 'axios said no',
      config: { url: '/api/x', method: 'get' },
      response: { status: 400, data: 'not-a-record', headers: 'not-a-record' },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.message).toBe('axios said no');
    expect(classified.requestId).toBeUndefined();
  });

  it('falls back to GET for an unrecognized method string', () => {
    const error = {
      isAxiosError: true,
      message: 'Failed',
      config: { url: '/api/x', method: 'options' },
      response: { status: 500, data: {}, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.method).toBe('GET');
  });

  it('reads the error field when message and detail are absent', () => {
    const error = {
      isAxiosError: true,
      message: 'fallback',
      config: { url: '/api/x', method: 'get' },
      response: { status: 400, data: { error: 'from-error-field' }, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.message).toBe('from-error-field');
    expect(classified.errorCode).toBe('from-error-field');
  });

  it('reads the title field when message, detail and error are absent', () => {
    const error = {
      isAxiosError: true,
      message: 'fallback',
      config: { url: '/api/x', method: 'get' },
      response: { status: 400, data: { title: 'from-title' }, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.message).toBe('from-title');
  });

  it('includes a timestamp', () => {
    const before = Date.now();
    const error = {
      isAxiosError: true,
      message: 'Failed',
      config: { url: '/api/test', method: 'get' },
      response: { status: 500, data: {}, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error) as unknown as Record<string, unknown>;

    expect(classified.timestamp as number).toBeGreaterThanOrEqual(before);
  });
});

describe('handleResponseError', () => {
  it('rejects with the original error for AxiosErrors and logs', async () => {
    const logger = makeLogger();
    const error = {
      isAxiosError: true,
      message: 'Bad request',
      config: { url: '/api/test', method: 'post' },
      response: { status: 400, data: { message: 'Validation failed' }, headers: {} },
    } as unknown as AxiosError;

    await expect(handleResponseError(error, logger)).rejects.toBe(error);
    expect(logger.warn).toHaveBeenCalledWith(
      'errorClassifier',
      expect.stringContaining('HTTP POST /api/test failed'),
      expect.objectContaining({ status: 400 }),
    );
  });

  it('passes through non-object errors without logging', async () => {
    const logger = makeLogger();
    await expect(handleResponseError('string error', logger)).rejects.toBe('string error');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('passes through null without logging', async () => {
    const logger = makeLogger();
    await expect(handleResponseError(null, logger)).rejects.toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('registerErrorClassifier', () => {
  it('registers a response interceptor and returns its id', () => {
    const logger = makeLogger();
    const use = jest.fn().mockReturnValue(5);
    const instance = { interceptors: { response: { use } } } as unknown as AxiosInstance;

    const id = registerErrorClassifier(instance, logger);

    expect(use).toHaveBeenCalledTimes(1);
    expect(id).toBe(5);
  });

  it('passes responses through on success', () => {
    const logger = makeLogger();
    const use = jest.fn().mockReturnValue(0);
    const instance = { interceptors: { response: { use } } } as unknown as AxiosInstance;

    registerErrorClassifier(instance, logger);

    const onFulfilled = use.mock.calls[0][0] as (r: unknown) => unknown;
    const response = { data: { ok: true }, status: 200 };
    expect(onFulfilled(response)).toBe(response);
  });

  it('routes rejections through handleResponseError', async () => {
    const logger = makeLogger();
    const use = jest.fn().mockReturnValue(0);
    const instance = { interceptors: { response: { use } } } as unknown as AxiosInstance;

    registerErrorClassifier(instance, logger);

    const onRejected = use.mock.calls[0][1] as (e: unknown) => Promise<never>;
    const error = {
      isAxiosError: true,
      message: 'Server Error',
      config: { url: '/api/data', method: 'get' },
      response: { status: 500, data: {}, headers: {} },
    };

    await expect(onRejected(error)).rejects.toBe(error);
    expect(logger.warn).toHaveBeenCalled();
  });
});
