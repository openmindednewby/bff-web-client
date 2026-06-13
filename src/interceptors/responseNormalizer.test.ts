import { ErrorSeverity } from '@dloizides/api-client-base';

import { registerResponseNormalizer } from './responseNormalizer';

import type { BffLogger, EmitToast } from '../types';
import type { AxiosInstance } from 'axios';

function makeLogger(): jest.Mocked<BffLogger> {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function register(
  emitToast: EmitToast,
  logger: BffLogger,
): (response: unknown) => unknown {
  const use = jest.fn().mockReturnValue(3);
  const instance = { interceptors: { response: { use } } } as unknown as AxiosInstance;

  const id = registerResponseNormalizer(instance, emitToast, logger);
  expect(id).toBe(3);

  return use.mock.calls[0][0] as (response: unknown) => unknown;
}

describe('responseNormalizer', () => {
  it('emits a toast with the body message for a mutation', () => {
    const emitToast = jest.fn();
    const onFulfilled = register(emitToast, makeLogger());

    const response = { config: { method: 'post' }, data: { message: 'Created!' } };
    expect(onFulfilled(response)).toBe(response);
    expect(emitToast).toHaveBeenCalledWith('Created!', ErrorSeverity.Info);
  });

  it('falls back to the detail field', () => {
    const emitToast = jest.fn();
    const onFulfilled = register(emitToast, makeLogger());

    onFulfilled({ config: { method: 'put' }, data: { detail: 'Updated' } });
    expect(emitToast).toHaveBeenCalledWith('Updated', ErrorSeverity.Info);
  });

  it('uses the default success message when the body has none', () => {
    const emitToast = jest.fn();
    const onFulfilled = register(emitToast, makeLogger());

    onFulfilled({ config: { method: 'delete' }, data: {} });
    expect(emitToast).toHaveBeenCalledWith('Saved successfully.', ErrorSeverity.Info);
  });

  it('uses the default message when the body is not a record', () => {
    const emitToast = jest.fn();
    const onFulfilled = register(emitToast, makeLogger());

    onFulfilled({ config: { method: 'patch' }, data: 'plain string' });
    expect(emitToast).toHaveBeenCalledWith('Saved successfully.', ErrorSeverity.Info);
  });

  it('does not emit for non-mutating methods', () => {
    const emitToast = jest.fn();
    const onFulfilled = register(emitToast, makeLogger());

    onFulfilled({ config: { method: 'get' }, data: { message: 'ignored' } });
    expect(emitToast).not.toHaveBeenCalled();
  });

  it('does not emit when the method is undefined', () => {
    const emitToast = jest.fn();
    const onFulfilled = register(emitToast, makeLogger());

    onFulfilled({ config: {}, data: { message: 'ignored' } });
    expect(emitToast).not.toHaveBeenCalled();
  });

  it('logs a warning and still returns the response when the emitter throws', () => {
    const emitToast = jest.fn(() => {
      throw new Error('bus down');
    });
    const logger = makeLogger();
    const onFulfilled = register(emitToast, logger);

    const response = { config: { method: 'post' }, data: { message: 'x' } };
    expect(onFulfilled(response)).toBe(response);
    expect(logger.warn).toHaveBeenCalledWith(
      'responseNormalizer',
      'Failed to emit success notification',
      expect.any(Error),
    );
  });
});
