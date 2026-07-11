import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NavigationAction } from '@react-navigation/native';

type ConfirmDiscard = (onDiscard: () => void) => void;

type PendingRemoval = {
  action?: NavigationAction;
  onAllowed?: () => void;
};

/**
 * Stops native-stack transitions before they begin while a screen has edits
 * that have not been saved. Use `allowRemoval` after a save or delete flow.
 */
export function usePreventUnsavedChanges(hasUnsavedChanges: boolean, confirmDiscard: ConfirmDiscard) {
  const navigation = useNavigation();
  const pendingRemovalRef = useRef<PendingRemoval | undefined>(undefined);
  const [isRemovalAllowed, setIsRemovalAllowed] = useState(false);

  const allowRemoval = useCallback((onAllowed: () => void) => {
    pendingRemovalRef.current = { onAllowed };
    setIsRemovalAllowed(true);
  }, []);

  useEffect(() => {
    if (!isRemovalAllowed) return;
    const pendingRemoval = pendingRemovalRef.current;
    if (!pendingRemoval) return;
    pendingRemovalRef.current = undefined;
    if (pendingRemoval.action) {
      navigation.dispatch(pendingRemoval.action);
      return;
    }
    pendingRemoval.onAllowed?.();
  }, [isRemovalAllowed, navigation]);

  usePreventRemove(
    hasUnsavedChanges && !isRemovalAllowed,
    ({ data }) => {
      pendingRemovalRef.current = { action: data.action };
      confirmDiscard(() => setIsRemovalAllowed(true));
    },
  );

  return allowRemoval;
}
