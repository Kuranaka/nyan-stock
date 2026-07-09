import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';

import { householdRealtimeEventName, householdRealtimeResubscribeEventName } from './householdRealtime';

export function useHouseholdSyncEvents(onUpdate: () => void) {
  useEffect(() => {
    const updateSubscription = DeviceEventEmitter.addListener(householdRealtimeEventName, onUpdate);
    const resubscribeSubscription = DeviceEventEmitter.addListener(householdRealtimeResubscribeEventName, onUpdate);
    return () => {
      updateSubscription.remove();
      resubscribeSubscription.remove();
    };
  }, [onUpdate]);
}
