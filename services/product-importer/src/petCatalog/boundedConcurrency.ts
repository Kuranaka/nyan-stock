export async function forEachWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('concurrency must be a positive integer.');
  }
  if (items.length === 0) return;

  let nextIndex = 0;
  let failure: unknown;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (failure === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        await operation(items[index], index);
      } catch (error) {
        failure ??= error;
      }
    }
  });

  await Promise.all(workers);
  if (failure !== undefined) throw failure;
}

export async function forEachWithKeyedConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  conflictKeys: (item: T) => readonly string[],
  operation: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('concurrency must be a positive integer.');
  }

  let remaining = items.map((item, index) => ({ item, index }));
  while (remaining.length > 0) {
    const usedKeys = new Set<string>();
    const batch: typeof remaining = [];
    const deferred: typeof remaining = [];
    for (const entry of remaining) {
      const keys = [...new Set(conflictKeys(entry.item))];
      const conflicts = keys.some((key) => usedKeys.has(key));
      if (batch.length < concurrency && !conflicts) {
        batch.push(entry);
        for (const key of keys) usedKeys.add(key);
      } else {
        deferred.push(entry);
      }
    }
    await forEachWithConcurrency(batch, concurrency, (entry) => operation(entry.item, entry.index));
    remaining = deferred;
  }
}
