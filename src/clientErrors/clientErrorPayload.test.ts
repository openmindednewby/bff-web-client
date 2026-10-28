import {
  MAX_MESSAGE_LENGTH,
  MAX_PAGE_LENGTH,
  MAX_STACK_LENGTH,
  UNKNOWN_ERROR_MESSAGE,
  buildClientErrorPayload,
  describeError,
} from './clientErrorPayload';
import { ClientErrorLevel } from './clientErrorTypes';

describe('describeError', () => {
  it('with an Error, returns its message and stack', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n at a.js:1';

    const parts = describeError(error);

    expect(parts).toEqual({ message: 'boom', stack: 'Error: boom\n at a.js:1', traceId: undefined });
  });

  it('with a string, returns the string as the message', () => {
    const parts = describeError('plain failure');

    expect(parts.message).toBe('plain failure');
  });

  it.each([undefined, null, ''])('with %p, returns the unknown-error message', (value) => {
    const parts = describeError(value);

    expect(parts.message).toBe(UNKNOWN_ERROR_MESSAGE);
  });

  it('with a number, returns it as text', () => {
    const parts = describeError(42);

    expect(parts.message).toBe('42');
  });

  it('with an object without a message, returns its JSON', () => {
    const parts = describeError({ code: 7 });

    expect(parts.message).toBe('{"code":7}');
  });

  it('with a circular object without a message, returns the unknown-error message', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const parts = describeError(circular);

    expect(parts.message).toBe(UNKNOWN_ERROR_MESSAGE);
  });

  it('with an object whose JSON is undefined, returns the unknown-error message', () => {
    const value = { toJSON: (): undefined => undefined };

    const parts = describeError(value);

    expect(parts.message).toBe(UNKNOWN_ERROR_MESSAGE);
  });

  it('with a traceId on the error, returns that trace id', () => {
    const error = Object.assign(new Error('x'), { traceId: 'abc123' });

    const parts = describeError(error);

    expect(parts.traceId).toBe('abc123');
  });

  it('with an axios error carrying x-trace-id, returns the response trace id', () => {
    const traceId = '0af7651916cd43dd8448eb211c80319c';
    const error = { isAxiosError: true, message: 'bad', response: { headers: { 'x-trace-id': traceId } } };

    const parts = describeError(error);

    expect(parts.traceId).toBe(traceId);
  });
});

describe('buildClientErrorPayload', () => {
  it('with a query string and hash in the path, keeps the path only', () => {
    const payload = buildClientErrorPayload(new Error('x'), '/events/5?token=secret#top');

    expect(payload.page).toBe('/events/5');
  });

  it('with a hash only in the path, drops the hash', () => {
    const payload = buildClientErrorPayload(new Error('x'), '/a#b');

    expect(payload.page).toBe('/a');
  });

  it('with over-long message, stack and page, truncates each to its limit', () => {
    const error = new Error('m'.repeat(MAX_MESSAGE_LENGTH + 5));
    error.stack = 's'.repeat(MAX_STACK_LENGTH + 5);
    const page = `/${'p'.repeat(MAX_PAGE_LENGTH + 5)}`;

    const payload = buildClientErrorPayload(error, page);

    expect([payload.message.length, payload.stack?.length, payload.page.length]).toEqual([
      MAX_MESSAGE_LENGTH,
      MAX_STACK_LENGTH,
      MAX_PAGE_LENGTH,
    ]);
  });

  it('with no level, defaults to error and omits empty optional fields', () => {
    const payload = buildClientErrorPayload('x', '/p', undefined, '');

    expect(payload).toEqual({ message: 'x', page: '/p', level: 'error' });
  });

  it('with warning level, app version and trace id, includes all three', () => {
    const error = { message: 'slow', traceId: 't1' };

    const payload = buildClientErrorPayload(error, '/p', ClientErrorLevel.Warning, '1.2.3');

    expect(payload).toEqual({ message: 'slow', page: '/p', level: 'warning', appVersion: '1.2.3', traceId: 't1' });
  });
});
