import { browserFetch, browserWindow } from './browserGlobals';
import { installClientErrorReporter } from './installClientErrorReporter';

jest.mock('./browserGlobals', () => {
  const actual = jest.requireActual<typeof import('./browserGlobals')>('./browserGlobals');
  return { browserWindow: jest.fn(actual.browserWindow), browserFetch: jest.fn(actual.browserFetch) };
});

const mockedWindow = browserWindow as jest.Mock;
const mockedFetch = browserFetch as jest.Mock;

describe('browserWindow', () => {
  it('in a browser environment, returns the global window', () => {
    const win = jest.requireActual<typeof import('./browserGlobals')>('./browserGlobals').browserWindow();

    expect(win).toBe(window);
  });
});

describe('browserFetch', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('with no global fetch, returns undefined', () => {
    const result = jest.requireActual<typeof import('./browserGlobals')>('./browserGlobals').browserFetch();

    expect(result).toBeUndefined();
  });

  it('with a global fetch, returns a wrapper that calls it', async () => {
    const globalFetch = jest.fn(() => Promise.resolve('sent'));
    (globalThis as { fetch?: unknown }).fetch = globalFetch;
    const wrapper = jest.requireActual<typeof import('./browserGlobals')>('./browserGlobals').browserFetch();

    const result = await wrapper?.('/x', { method: 'POST' });

    expect([result, globalFetch.mock.calls.length]).toEqual(['sent', 1]);
  });
});

describe('installClientErrorReporter without browser globals', () => {
  it('with no window, reports nothing and disposes safely', () => {
    mockedWindow.mockReturnValueOnce(undefined);
    mockedFetch.mockReturnValueOnce(jest.fn());
    const reporter = installClientErrorReporter();

    const result = reporter.report('x');

    reporter.dispose();
    expect(result).toBe(false);
  });

  it('with no fetch, reports nothing', () => {
    mockedFetch.mockReturnValueOnce(undefined);
    const reporter = installClientErrorReporter({ listen: false });

    const result = reporter.report('x');

    expect(result).toBe(false);
  });
});
