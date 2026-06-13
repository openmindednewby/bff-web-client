/**
 * Clean axios instance factory for the BFF era.
 *
 * Produces an axios instance with the BFF defaults (JSON, XHR marker,
 * credentialed) and no interceptors. Interceptors are wired separately via
 * {@link registerInterceptors} so the app controls the chain composition.
 */

import axios from 'axios';

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
  return axios.create({
    timeout: options.timeoutMs,
    baseURL: options.baseURL,
    headers: { ...BFF_DEFAULT_HEADERS, ...(options.headers ?? {}) },
    withCredentials: true,
  });
}

export { createBffAxiosClient };
