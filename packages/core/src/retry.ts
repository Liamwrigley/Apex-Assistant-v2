export async function withRetry<T>(
  task: () => Promise<T>,
  options?: { retries?: number; baseDelayMs?: number }
): Promise<T> {
  const retries = options?.retries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      const backoff = baseDelayMs * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError;
}
