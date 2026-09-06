/**
 * These tests exist to FAIL if the guard is removed. That is the acceptance criterion for
 * the guard itself: a check that cannot observe the thing it guards is not evidence, so
 * each case here is written against the real 2026-09-06 defect, not against the implementation.
 */

import { createBffAxiosClient } from './createBffAxiosClient';
import { applyWriteContentTypeGuard } from './writeContentTypeGuard';
import { captureWriteRequests, expectJsonWriteShape } from './testing/assertWriteShape';

import type { InternalAxiosRequestConfig } from 'axios';

const configOf = (over: Partial<InternalAxiosRequestConfig>): InternalAxiosRequestConfig =>
  ({ url: '/checkin', headers: {}, ...over }) as InternalAxiosRequestConfig;

describe('applyWriteContentTypeGuard', () => {
  describe('the defect it was written for', () => {
    it('gives a body-less POST a body, so axios cannot strip Content-Type', () => {
      // THE REGRESSION. axios v1 does `if (requestData === undefined) setContentType(null)`,
      // so a body-less POST reached the server with no content type and got 415.
      const result = applyWriteContentTypeGuard(configOf({ method: 'post', data: undefined }));

      expect(result.data).toEqual({});
      expect((result.headers as unknown as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
    });

    it.each(['post', 'put', 'patch', 'delete'])(
      'applies to %s, not just post',
      (method) => {
        const result = applyWriteContentTypeGuard(configOf({ method, data: undefined }));
        expect(result.data).toEqual({});
      },
    );
  });

  describe('what it deliberately leaves alone', () => {
    it('does not touch a GET', () => {
      const result = applyWriteContentTypeGuard(configOf({ method: 'get', data: undefined }));
      expect(result.data).toBeUndefined();
    });

    it('does not stamp JSON on a FormData upload (that is a 415 in the other direction)', () => {
      const body = new FormData();
      const result = applyWriteContentTypeGuard(configOf({ method: 'post', data: body }));

      expect(result.data).toBe(body);
      expect((result.headers as unknown as Record<string, string>)['Content-Type']).toBeUndefined();
    });

    it('does not touch URLSearchParams bodies', () => {
      const body = new URLSearchParams({ a: '1' });
      const result = applyWriteContentTypeGuard(configOf({ method: 'post', data: body }));
      expect(result.data).toBe(body);
    });

    it('honours an explicit Content-Type: undefined opt-out', () => {
      const result = applyWriteContentTypeGuard(
        configOf({ method: 'post', data: undefined, headers: { 'Content-Type': undefined } as never }),
      );
      expect(result.data).toBeUndefined();
    });

    it('preserves a caller-supplied Content-Type', () => {
      const result = applyWriteContentTypeGuard(
        configOf({ method: 'post', data: { a: 1 }, headers: { 'Content-Type': 'application/merge-patch+json' } as never }),
      );
      expect((result.headers as unknown as Record<string, string>)['Content-Type']).toBe(
        'application/merge-patch+json',
      );
    });
  });

  describe('refusal', () => {
    it('throws rather than emit a write that is already known to 415', () => {
      // Headers bag that silently swallows writes — simulates a chain that drops the header.
      const swallowing = {
        get: () => undefined,
        set: () => undefined,
      } as unknown as InternalAxiosRequestConfig['headers'];

      expect(() =>
        applyWriteContentTypeGuard(configOf({ method: 'post', data: undefined, headers: swallowing })),
      ).toThrow(/415/);
    });
  });
});

describe('createBffAxiosClient wiring', () => {
  it('every write verb leaves the factory-made client correctly shaped', async () => {
    const client = createBffAxiosClient({ baseURL: 'https://bff.example.test', timeoutMs: 1000 });

    const captured = await captureWriteRequests(client, '/checkin');

    // The assertion an app inherits — same helper, same guarantee.
    expect(() => expectJsonWriteShape(captured)).not.toThrow();
    expect(captured.post.contentType).toContain('json');
    expect(captured.post.hasBody).toBe(true);
  });

  it('expectJsonWriteShape names the offending verb when a write is malformed', () => {
    expect(() =>
      expectJsonWriteShape({
        post: { method: 'post', url: '/checkin', contentType: undefined, data: undefined, hasBody: false },
        put: { method: 'put', url: '/x', contentType: 'application/json', data: {}, hasBody: true },
        patch: { method: 'patch', url: '/x', contentType: 'application/json', data: {}, hasBody: true },
        delete: { method: 'delete', url: '/x', contentType: 'application/json', data: {}, hasBody: true },
      }),
    ).toThrow(/POST \/checkin/);
  });
});
