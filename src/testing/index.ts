/**
 * `@dloizides/bff-web-client/testing` — assertions every consuming app inherits.
 *
 * Kept in a subpath so production bundles never pull it, and so an app's unit tests can pin
 * the shape of what its OWN configured client emits. See assertWriteShape.ts for why this
 * exists (the 2026-09-06 door check-in 415).
 */

export { captureWriteRequests, expectJsonWriteShape, WRITE_VERBS } from './assertWriteShape';
export type { CapturedRequest, WriteVerb } from './assertWriteShape';
