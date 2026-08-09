export async function loadAllKeysetPages<T extends { id: string }>(
  loadPage: (afterId: string | undefined, limit: number) => Promise<T[]>,
  pageSize: number,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('pageSize must be a positive integer.');
  }

  const rows: T[] = [];
  let afterId: string | undefined;

  for (;;) {
    const page = await loadPage(afterId, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return rows;

    const nextCursor = page.at(-1)?.id;
    if (!nextCursor || nextCursor === afterId) {
      throw new Error('Keyset pagination did not advance.');
    }
    afterId = nextCursor;
  }
}
