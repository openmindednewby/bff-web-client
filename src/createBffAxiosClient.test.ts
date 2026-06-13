import { createBffAxiosClient } from './createBffAxiosClient';

describe('createBffAxiosClient', () => {
  it('creates an instance with the supplied timeout and credentials', () => {
    const instance = createBffAxiosClient({ timeoutMs: 12345 });

    expect(instance.defaults.timeout).toBe(12345);
    expect(instance.defaults.withCredentials).toBe(true);
  });

  it('sets the BFF default headers', () => {
    const instance = createBffAxiosClient({ timeoutMs: 1000 });
    const headers = instance.defaults.headers as Record<string, unknown>;

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('applies an optional baseURL', () => {
    const instance = createBffAxiosClient({ timeoutMs: 1000, baseURL: 'https://bff.example' });

    expect(instance.defaults.baseURL).toBe('https://bff.example');
  });

  it('merges extra headers over the defaults', () => {
    const instance = createBffAxiosClient({
      timeoutMs: 1000,
      headers: { 'X-Custom': 'yes', 'Accept': 'text/plain' },
    });
    const headers = instance.defaults.headers as Record<string, unknown>;

    expect(headers['X-Custom']).toBe('yes');
    expect(headers['Accept']).toBe('text/plain');
  });

  it('leaves baseURL undefined when not supplied', () => {
    const instance = createBffAxiosClient({ timeoutMs: 1000 });

    expect(instance.defaults.baseURL).toBeUndefined();
  });
});
