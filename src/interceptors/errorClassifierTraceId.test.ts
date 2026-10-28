import { classifyError, handleResponseError } from './errorClassifierInterceptor';

import type { BffLogger } from '../types';
import type { AxiosError } from 'axios';

function makeLogger(): jest.Mocked<BffLogger> {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('classifyError', () => {
  it('with a ProblemDetails traceId in the body, sets traceId on the classified error', () => {
    const traceId = 'f'.repeat(32);
    const error = {
      isAxiosError: true,
      message: 'fail',
      config: { url: '/api/x', method: 'get', headers: {} },
      response: { status: 500, data: { traceId }, headers: {} },
    } as unknown as AxiosError;

    const classified = classifyError(error);

    expect(classified.traceId).toBe(traceId);
  });
});

describe('handleResponseError', () => {
  it('with an x-trace-id response header, exposes traceId on the rejected error', async () => {
    const traceId = '1'.repeat(32);
    const error = {
      isAxiosError: true,
      message: 'fail',
      config: { url: '/api/x', method: 'get', headers: {} },
      response: { status: 500, data: {}, headers: { 'x-trace-id': traceId } },
    } as unknown as AxiosError;

    const rejected: unknown = await handleResponseError(error, makeLogger()).catch((reason: unknown) => reason);

    expect((rejected as { traceId?: string }).traceId).toBe(traceId);
  });
});
