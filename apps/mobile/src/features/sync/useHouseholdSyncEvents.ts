import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';

import { householdRealtimeEventName } from './householdRealtime';

export function useHouseholdSyncEvents(onUpdate: () => void) {
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(householdRealtimeEventName, onUpdate);
    return () => {
      subscription.remove();
    };
  }, [onUpdate]);
}
