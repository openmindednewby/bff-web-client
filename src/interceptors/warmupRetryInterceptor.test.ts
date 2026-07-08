import {
  registerWarmupRetryInterceptor,
  DEFAULT_MAX_RETRIES,
} from './warmupRetryInterceptor';

import type { BffLogger } from '../types';
import type { AxiosError, AxiosInstance } from 'axios';

function makeLogger(): jest.Mocked<BffLogger> {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

type Rejected = (error: unknown) => Promise<unknown>;

/**
 * A minimal axios-instance stand-in that captures the rejection handler the
 * interceptor registers and lets the test drive `instance.request`.
 */
function makeInstance() {
  const request = jest.fn();
  let rejected: Rejected = () => Promise.reject(new Error('not registered'));
  const instance = {
    interceptors: {
      response: {
        use: (_onFulfilled: unknown, onRejected: Rejected): number => {
          rejected = onRejected;
          return 1;
        },
      },
    },
    request,
  } as unknown as AxiosInstance;
  return { instance, request, getRejected: (): Rejected => rejected };
}

const instantSleep = (): Promise<void> => Promise.resolve();

function axiosErr(status: number, count?: number): AxiosError {
  return {
    isAxiosError: true,
    message: `HTTP ${status}`,
    config: { url: '/bff/me', method: 'get', ...(count !== undefined ? { __warmupRetryCount: count } : {}) },
    response: { status, data: {}, headers: {} },
  } as unknown as AxiosError;
}

describe('registerWarmupRetryInterceptor', () => {
  it('retries a 503 by re-issuing the request with an incremented count', async () => {
    const { instance, request, getRejected } = makeInstance();
    request.mockResolvedValueOnce({ status: 200, data: { authenticated: true } });
    registerWarmupRetryInterceptor(instance, makeLogger(), { sleep: instantSleep });

    const result = await getRejected()(axiosErr(503));

    expect(request).toHaveBeenCalledTimes(1);
    const reissuedConfig = request.mock.calls[0][0] as { __warmupRetryCount?: number };
    expect(reissuedConfig.__warmupRetryCount).toBe(1);
    expect(result).toEqual({ status: 200, data: { authenticated: true } });
  });

  it.each([502, 503, 504])('retries transient gateway status %s', async (status) => {
    const { instance, request, getRejected } = makeInstance();
    request.mockResolvedValueOnce({ status: 200 });
    registerWarmupRetryInterceptor(instance, makeLogger(), { sleep: instantSleep });

    await getRejected()(axiosErr(status));

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 401 (auth answer, not a warm-up) — rejects through', async () => {
    const { instance, request, getRejected } = makeInstance();
    registerWarmupRetryInterceptor(instance, makeLogger(), { sleep: instantSleep });

    await expect(getRejected()(axiosErr(401))).rejects.toMatchObject({ response: { status: 401 } });
    expect(request).not.toHaveBeenCalled();
  });

  it('does NOT retry a 500 (real server error)', async () => {
    const { instance, request, getRejected } = makeInstance();
    registerWarmupRetryInterceptor(instance, makeLogger(), { sleep: instantSleep });

    await expect(getRejected()(axiosErr(500))).rejects.toMatchObject({ response: { status: 500 } });
    expect(request).not.toHaveBeenCalled();
  });

  it('gives up (rejects + warns) once the retry budget is exhausted', async () => {
    const { instance, request, getRejected } = makeInstance();
    const logger = makeLogger();
    registerWarmupRetryInterceptor(instance, logger, { sleep: instantSleep });

    // Config already at the max attempt count → the next failure gives up.
    await expect(getRejected()(axiosErr(503, DEFAULT_MAX_RETRIES))).rejects.toMatchObject({
      response: { status: 503 },
    });
    expect(request).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'warmupRetry',
      expect.stringContaining('gave up'),
      expect.objectContaining({ status: 503 }),
    );
  });

  it('passes a non-axios error straight through', async () => {
    const { instance, request, getRejected } = makeInstance();
    registerWarmupRetryInterceptor(instance, makeLogger(), { sleep: instantSleep });

    const plain = new Error('boom');
    await expect(getRejected()(plain)).rejects.toBe(plain);
    expect(request).not.toHaveBeenCalled();
  });

  it('fires onWarmupRetry with the attempt details while retrying (UX Move 3)', async () => {
    const { instance, request, getRejected } = makeInstance();
    request.mockResolvedValueOnce({ status: 200 });
    const onWarmupRetry = jest.fn();
    registerWarmupRetryInterceptor(instance, makeLogger(), { sleep: instantSleep, onWarmupRetry });

    await getRejected()(axiosErr(503));

    expect(onWarmupRetry).toHaveBeenCalledTimes(1);
    expect(onWarmupRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, maxRetries: DEFAULT_MAX_RETRIES, status: 503, url: '/bff/me' }),
    );
  });

  it('does NOT fire onWarmupRetry once the retry budget is exhausted', async () => {
    const { instance, getRejected } = makeInstance();
    const onWarmupRetry = jest.fn();
    registerWarmupRetryInterceptor(instance, makeLogger(), { sleep: instantSleep, onWarmupRetry });

    await expect(getRejected()(axiosErr(503, DEFAULT_MAX_RETRIES))).rejects.toMatchObject({
      response: { status: 503 },
    });
    expect(onWarmupRetry).not.toHaveBeenCalled();
  });

  it('a throwing onWarmupRetry callback never breaks the retry', async () => {
    const { instance, request, getRejected } = makeInstance();
    request.mockResolvedValueOnce({ status: 200 });
    const onWarmupRetry = jest.fn(() => {
      throw new Error('ui blew up');
    });
    registerWarmupRetryInterceptor(instance, makeLogger(), { sleep: instantSleep, onWarmupRetry });

    const result = await getRejected()(axiosErr(503));

    expect(result).toEqual({ status: 200 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('honours custom retryableStatuses + maxRetries', async () => {
    const { instance, request, getRejected } = makeInstance();
    request.mockResolvedValueOnce({ status: 200 });
    registerWarmupRetryInterceptor(instance, makeLogger(), {
      sleep: instantSleep,
      retryableStatuses: [418],
      maxRetries: 1,
    });

    // 418 now retryable...
    await getRejected()(axiosErr(418));
    expect(request).toHaveBeenCalledTimes(1);
    // ...but 503 no longer is.
    await expect(getRejected()(axiosErr(503))).rejects.toMatchObject({ response: { status: 503 } });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
