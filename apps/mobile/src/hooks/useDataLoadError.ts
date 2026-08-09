import { useCallback, useState } from 'react';

const fallbackLoadError = '通信状況を確認して、もう一度お試しください。';

export function useDataLoadError() {
  const [loadError, setLoadError] = useState<string | undefined>();

  const runWithLoadError = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    setLoadError(undefined);
    try {
      await operation();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : fallbackLoadError);
    }
  }, []);

  return { loadError, runWithLoadError };
}
