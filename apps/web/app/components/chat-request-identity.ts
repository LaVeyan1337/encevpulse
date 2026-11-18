export type ChatRequestIdentity = {
  payloadKey: string;
  replyToId: string | null;
  clientRequestId: string;
};

/**
 * Reuse an idempotency key only when the logical payload and reply target are
 * unchanged. This lets the server recognize a retry after a lost response.
 */
export function resolveChatRequestIdentity(
  existing: ChatRequestIdentity | null,
  payloadKey: string,
  replyToId: string | null,
  createRequestId: () => string,
): ChatRequestIdentity {
  if (existing && existing.payloadKey === payloadKey && existing.replyToId === replyToId) {
    return existing;
  }
  return { payloadKey, replyToId, clientRequestId: createRequestId() };
}
