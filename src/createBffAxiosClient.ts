/**
 * Clean axios instance factory for the BFF era.
 *
 * Produces an axios instance with the BFF defaults (JSON, XHR marker,
 * credentialed) and no interceptors. Interceptors are wired separately via
 * {@link registerInterceptors} so the app controls the chain composition.
 */

import axios from 'axios';

import { registerWriteContentTypeGuard } from './writeContentTypeGuard';

import type { BffAxiosClientOptions } from './types';
import type { AxiosInstance } from 'axios';

const BFF_DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
};

/**
 * Creates a credentialed axios instance with the shared BFF defaults. No
 * interceptors are registered here — call {@link registerInterceptors} once at
 * bootstrap to install the chain.
 */
function createBffAxiosClient(options: BffAxiosClientOptions): AxiosInstance {
  const instance = axios.create({
    timeout: options.timeoutMs,
    baseURL: options.baseURL,
    headers: { ...BFF_DEFAULT_HEADERS, ...(options.headers ?? {}) },
    withCredentials: true,
  });

  // NOT one of the app-concern interceptors (logging / toast / csrf / error) that
  // `registerInterceptors` composes — this is transport correctness, and every consumer
  // must have it or the instance can emit a request that is already known to 415. The
  // defaults above are NOT sufficient on their own: axios strips Content-Type when a
  // request has no body. See writeContentTypeGuard.ts.
  registerWriteContentTypeGuard(instance);

  return instance;
}

export { createBffAxiosClient };
