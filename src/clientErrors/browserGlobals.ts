import type { ClientErrorFetch, ClientErrorWindow } from './clientErrorTypes';

export function browserWindow(): ClientErrorWindow | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

export function browserFetch(): ClientErrorFetch | undefined {
  return typeof fetch === 'function' ? (input, init): Promise<unknown> => fetch(input, init) : undefined;
}
