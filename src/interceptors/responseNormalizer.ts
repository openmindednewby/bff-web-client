/**
 * Response interceptor: normalizes successful API responses.
 *
 * For successful mutation requests (POST/PUT/PATCH/DELETE), emits a toast via
 * the app-supplied {@link EmitToast} port so the UI can display a success
 * notification without coupling the package to a specific UI bus.
 */

import { ErrorSeverity } from '@dloizides/api-client-base';
import { isValueDefined } from '@dloizides/utils';

import type { BffLogger, EmitToast } from '../types';
import type { AxiosInstance, AxiosResponse } from 'axios';

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const DEFAULT_SUCCESS_MESSAGE = 'Saved successfully.';
const LOG_CONTEXT = 'responseNormalizer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return isValueDefined(value) && typeof value === 'object';
}

function extractMessageFromBody(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const message = data.message;
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }

  const detail = data.detail;
  if (typeof detail === 'string' && detail.length > 0) {
    return detail;
  }

  return undefined;
}

function isMutatingMethod(method: string | undefined): boolean {
  if (typeof method !== 'string') {
    return false;
  }
  return MUTATING_METHODS.includes(method.toUpperCase());
}

/**
 * Handles a successful response by emitting a toast for mutations.
 *
 * Always returns the original `response` unchanged — an axios response
 * interceptor must pass the response through. The invariant return is the
 * required contract, not a code smell.
 */
// eslint-disable-next-line sonarjs/no-invariant-returns
function handleSuccessResponse(
  response: AxiosResponse,
  emitToast: EmitToast,
  logger: BffLogger,
): AxiosResponse {
  try {
    const method = response.config.method;
    if (!isMutatingMethod(method)) {
      return response;
    }

    const message = extractMessageFromBody(response.data) ?? DEFAULT_SUCCESS_MESSAGE;
    emitToast(String(message), ErrorSeverity.Info);
  } catch (emitError) {
    logger.warn(LOG_CONTEXT, 'Failed to emit success notification', emitError);
  }

  return response;
}

/**
 * Registers the response normalizer interceptor on an axios instance.
 * @returns The interceptor ID for potential ejection.
 */
function registerResponseNormalizer(
  instance: AxiosInstance,
  emitToast: EmitToast,
  logger: BffLogger,
): number {
  return instance.interceptors.response.use((response) =>
    handleSuccessResponse(response, emitToast, logger),
  );
}

export { registerResponseNormalizer };
