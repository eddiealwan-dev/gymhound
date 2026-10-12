import { useCallback, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { getHealthStore } from '../../platform/health';
import { useDbQuery } from '../../state/dataVersion';
import { setHealthSwitch, type HealthSwitch } from '../../state/healthSync';
import { Body, Label } from '../Text';
import { Toggle } from '../Toggle';

/**
 * PHASE 7: Settings → Apple Health (iPhone) or Health Connect (Android) (§17.1, R307). One switch for the write-out and
 * one for each read; turning one on shows the store's own permission sheet first. Shown only where a health store is
 * in the build, so Expo Go and the web never show it. It follows the Settings sections' layout (a Label over 44pt rows).
 */

type Row = { key: Exclude<HealthSwitch, 'steps'>; label: (store: string) => string };

const ROWS: Row[] = [
  { key: 'workouts', label: (store) => `Save workouts to ${store}` },
  { key: 'sleep', label: () => 'Read sleep' },
  { key: 'heartRate', label: () => 'Read resting heart rate' },
  { key: 'bodyweight', label: () => 'Read body weight' },
];

const readSwitches = (db: Db) => {
  const s = getSettings(db);
  return { workouts: s.healthWorkouts, sleep: s.healthSleep, heartRate: s.healthHeartRate, bodyweight: s.healthBodyweight };
};

export function HealthSettings(): ReactElement | null {
  const db = useDb();
  const store = getHealthStore();
  const values = useDbQuery(useCallback(readSwitches, []));
  const [busy, setBusy] = useState(false);
  if (store === null) return null;

  const onChange = (key: Row['key'], on: boolean) => {
    if (busy) return;
    setBusy(true);
    void setHealthSwitch(db, key, on, store).finally(() => setBusy(false));
  };

  return (
    <View style={{ gap: 8 }}>
      <Label>{store.name}</Label>
      <View style={{ gap: 16 }}>
        {ROWS.map(({ key, label }) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
            <Body style={{ flexShrink: 1 }}>{label(store.name)}</Body>
            <Toggle accessibilityLabel={label(store.name)} value={values[key]} onValueChange={(on) => onChange(key, on)} />
          </View>
        ))}
        <Body muted style={{ fontSize: 14 }}>
          Sleep and resting heart rate only offer Rough sleep when a session starts. Body weight is offered on the body-weight
          card. GymHound never marks a day or logs a weight by itself.
        </Body>
      </View>
    </View>
  );
}
