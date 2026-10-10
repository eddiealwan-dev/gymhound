/** An error's message, followed by its `code` in brackets when it has one (expo modules throw a CodedError). */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' || typeof code === 'number' ? `${message} (${code})` : message;
}
