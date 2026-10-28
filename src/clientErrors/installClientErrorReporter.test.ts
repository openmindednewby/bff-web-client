import { ClientErrorLevel } from './clientErrorTypes';
import type { ClientErrorFetch, ClientErrorWindow } from './clientErrorTypes';
import {
  DEFAULT_CLIENT_ERRORS_ENDPOINT,
  DEFAULT_MAX_CLIENT_ERROR_REPORTS,
  installClientErrorReporter,
} from './installClientErrorReporter';

type Listener = (event: Event) => void;

interface FakeWindow extends ClientErrorWindow {
  listeners: Map<string, Listener>;
  fire(type: string, event: Record<string, unknown>): void;
}

function fakeWindow(pathname = '/home'): FakeWindow {
  const listeners = new Map<string, Listener>();
  return {
    location: { pathname },
    listeners,
    addEventListener: (type: string, listener: Listener): void => {
      listeners.set(type, listener);
    },
    removeEventListener: (type: string): void => {
      listeners.delete(type);
    },
    fire: (type: string, event: Record<string, unknown>): void => {
      listeners.get(type)?.(event as unknown as Event);
    },
  };
}

function okFetch(): jest.Mock<Promise<unknown>, Parameters<ClientErrorFetch>> {
  return jest.fn<Promise<unknown>, Parameters<ClientErrorFetch>>(() => Promise.resolve({ ok: true }));
}

function sentBody(fetchImpl: jest.Mock, call = 0): Record<string, unknown> {
  const init = fetchImpl.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('installClientErrorReporter', () => {
  it('with a window error event, posts the error with CSRF header to the default endpoint', () => {
    const win = fakeWindow('/orders?id=9');
    const fetchImpl = okFetch();
    installClientErrorReporter({ win, fetchImpl, appVersion: '2.0.0' });

    win.fire('error', { error: new Error('render failed') });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit & { headers: Record<string, string> };
    expect([fetchImpl.mock.calls[0]?.[0], init.method, init.keepalive, init.headers['X-BFF-Csrf']]).toEqual([
      DEFAULT_CLIENT_ERRORS_ENDPOINT,
      'POST',
      true,
      '1',
    ]);
    expect(sentBody(fetchImpl)).toMatchObject({ message: 'render failed', page: '/orders', appVersion: '2.0.0' });
  });

  it('with an error event without an error object, reports the event message', () => {
    const win = fakeWindow();
    const fetchImpl = okFetch();
    installClientErrorReporter({ win, fetchImpl });

    win.fire('error', { message: 'Script error.' });

    expect(sentBody(fetchImpl).message).toBe('Script error.');
  });

  it('with an unhandled rejection, reports the rejection reason', () => {
    const win = fakeWindow();
    const fetchImpl = okFetch();
    installClientErrorReporter({ win, fetchImpl });

    win.fire('unhandledrejection', { reason: new Error('promise lost') });

    expect(sentBody(fetchImpl).message).toBe('promise lost');
  });

  it('with the same error twice, posts it once', () => {
    const fetchImpl = okFetch();
    const reporter = installClientErrorReporter({ win: fakeWindow(), fetchImpl, listen: false });
    reporter.report('dup');

    const second = reporter.report('dup');

    expect([second, fetchImpl.mock.calls.length]).toEqual([false, 1]);
  });

  it('with more distinct errors than the cap, stops posting at the cap', () => {
    const fetchImpl = okFetch();
    const reporter = installClientErrorReporter({ win: fakeWindow(), fetchImpl, listen: false });

    for (let i = 0; i <= DEFAULT_MAX_CLIENT_ERROR_REPORTS; i += 1) {reporter.report(`e${i}`);}

    expect(fetchImpl).toHaveBeenCalledTimes(DEFAULT_MAX_CLIENT_ERROR_REPORTS);
  });

  it('with a custom endpoint, level and header, sends them', () => {
    const fetchImpl = okFetch();
    const reporter = installClientErrorReporter({
      win: fakeWindow(),
      fetchImpl,
      listen: false,
      endpoint: '/api/errs',
      headers: { 'X-Custom': 'y' },
    });

    reporter.report('slow', ClientErrorLevel.Warning);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit & { headers: Record<string, string> };
    expect([fetchImpl.mock.calls[0]?.[0], init.headers['X-Custom'], sentBody(fetchImpl).level]).toEqual([
      '/api/errs',
      'y',
      'warning',
    ]);
  });

  it('with rejected and non-ok transport responses, stops after the failure limit', async () => {
    const fetchImpl = jest
      .fn<Promise<unknown>, Parameters<ClientErrorFetch>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    const reporter = installClientErrorReporter({ win: fakeWindow(), fetchImpl, listen: false, maxTransportFailures: 2 });
    reporter.report('a');
    reporter.report('b');
    await flush();

    const third = reporter.report('c');

    expect([third, fetchImpl.mock.calls.length]).toEqual([false, 2]);
  });

  it('with a transport that throws synchronously, returns false without throwing', () => {
    const fetchImpl = jest.fn<Promise<unknown>, Parameters<ClientErrorFetch>>(() => {
      throw new Error('sync');
    });
    const reporter = installClientErrorReporter({ win: fakeWindow(), fetchImpl, listen: false });

    const result = reporter.report('x');

    expect(result).toBe(false);
  });

  it('with a transport that raises an error event while sending, does not report it again', () => {
    const win = fakeWindow();
    const fetchImpl = jest.fn<Promise<unknown>, Parameters<ClientErrorFetch>>(() => {
      win.fire('error', { error: new Error('nested') });
      return Promise.resolve({ ok: true });
    });
    installClientErrorReporter({ win, fetchImpl });

    win.fire('error', { error: new Error('outer') });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('with dispose called, removes both listeners', () => {
    const win = fakeWindow();
    const reporter = installClientErrorReporter({ win, fetchImpl: okFetch() });

    reporter.dispose();

    expect(win.listeners.size).toBe(0);
  });

  it('with listen false, registers no listeners', () => {
    const win = fakeWindow();

    installClientErrorReporter({ win, fetchImpl: okFetch(), listen: false });

    expect(win.listeners.size).toBe(0);
  });
});
