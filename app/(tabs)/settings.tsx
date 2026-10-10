import { useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { getSettings, setSetting } from '../../src/db/repositories/settingsRepo';
import { switchDisplayUnit } from '../../src/db/repositories/unitsRepo';
import type { Db } from '../../src/db/types';
import { formatDateTime, formatRest } from '../../src/domain/dates';
import { REST_CHOICES } from '../../src/domain/rest';
import type { BellSound, DistanceUnit, ThemePreference, WeightUnit } from '../../src/domain/types';
import { playBell } from '../../src/platform/restTimer/bell';
import { latestSnapshotPath, shareFile } from '../../src/state/backup';
import { bumpData, useDbQuery } from '../../src/state/dataVersion';
import { BarPicker } from '../../src/ui/BarPicker';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const WEIGHT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
];

const DISTANCE_OPTIONS: { value: DistanceUnit; label: string }[] = [
  { value: 'mi', label: 'mi' },
  { value: 'km', label: 'km' },
];

const BELL_OPTIONS: { value: BellSound; label: string }[] = [
  { value: 'bell', label: 'Bell' },
  { value: 'chime', label: 'Chime' },
  { value: 'ding', label: 'Ding' },
];

/** The rest lengths Settings offers. Off is not one: it belongs to an exercise (its ⋯ menu), not to every exercise. */
const REST_LENGTHS = REST_CHOICES.filter((seconds) => seconds > 0);

/** Two or three choices in one pill; the chosen one is filled with `text`. */
function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 4 }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.text : 'transparent',
            }}
          >
            <Body weight={600} style={{ color: selected ? colors.bg : colors.text }}>
              {option.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Light, Dark or System. The choice is stored, and the theme provider re-reads it. */
function AppearanceControl() {
  const db = useDb();
  const current = useDbQuery(getSettings).theme;
  return (
    <SegmentedControl
      label="Appearance"
      options={OPTIONS}
      value={current}
      onChange={(value) => {
        setSetting(db, 'theme', value);
        bumpData();
      }}
    />
  );
}

/**
 * The display unit for weights (switching follows spec 7.1: only the setting changes, and plans convert when a workout
 * starts) and the unit for distances.
 */
function UnitsSection() {
  const db = useDb();
  const { unit, distanceUnit } = useDbQuery(getSettings);
  return (
    <View style={{ gap: 8, marginTop: 24 }}>
      <Body weight={600} muted>
        Units
      </Body>
      <Body>Weight</Body>
      <SegmentedControl
        label="Weight"
        options={WEIGHT_OPTIONS}
        value={unit}
        onChange={(value) => {
          switchDisplayUnit(db, value);
          bumpData();
        }}
      />
      <Body>Distance</Body>
      <SegmentedControl
        label="Distance"
        options={DISTANCE_OPTIONS}
        value={distanceUnit}
        onChange={(value) => {
          setSetting(db, 'distanceUnit', value);
          bumpData();
        }}
      />
    </View>
  );
}

/** The bar for the display unit. */
function BarSection() {
  return (
    <View style={{ gap: 8, marginTop: 24 }}>
      <Body weight={600} muted>
        Bar
      </Body>
      <Body>Used by the plate calculator.</Body>
      <BarPicker />
    </View>
  );
}

/**
 * The rest length every exercise on Default uses, as the segmented pill in rows of three: 0:30 to 5:00. The current one
 * is filled with `text`, and the screen reader says it is selected.
 */
function RestLengthControl({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 4 }}>
      {REST_LENGTHS.map((seconds) => {
        const selected = seconds === value;
        return (
          <Pressable
            key={seconds}
            accessibilityRole="button"
            accessibilityLabel={formatRest(seconds)}
            accessibilityState={{ selected }}
            onPress={() => onChange(seconds)}
            style={{
              flexGrow: 1,
              flexBasis: '30%',
              minHeight: 44,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.text : 'transparent',
            }}
          >
            <Body weight={600} style={{ color: selected ? colors.bg : colors.text, fontVariant: ['tabular-nums'] }}>
              {formatRest(seconds)}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The rest timer length, whether the timer rings when it ends, and which sound it makes. Choosing a sound plays it once. */
function RestTimerSection() {
  const { colors } = useTheme();
  const db = useDb();
  const { restSeconds, restBell, restBellSound } = useDbQuery(getSettings);
  return (
    <View style={{ gap: 8, marginTop: 24 }}>
      <Body weight={600} muted>
        Rest timer
      </Body>
      <Body>Length</Body>
      <RestLengthControl
        value={restSeconds}
        onChange={(seconds) => {
          setSetting(db, 'restSeconds', seconds);
          bumpData();
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
        <Body>Bell at the end</Body>
        <Switch
          accessibilityLabel="Bell at the end"
          value={restBell}
          onValueChange={(value) => {
            setSetting(db, 'restBell', value);
            bumpData();
          }}
          trackColor={{ false: colors.border, true: colors.text }}
          thumbColor={colors.bg}
          // react-native-web colours the thumb of a switch that is on from `activeThumbColor` (React Native has only
          // `thumbColor`) and would leave it teal. The phone ignores the extra prop.
          {...({ activeThumbColor: colors.bg } as object)}
        />
      </View>
      <Body>Bell sound</Body>
      <SegmentedControl
        label="Bell sound"
        options={BELL_OPTIONS}
        value={restBellSound}
        onChange={(value) => {
          setSetting(db, 'restBellSound', value);
          bumpData();
          void playBell(value);
        }}
      />
    </View>
  );
}

/** Module-level, so `useDbQuery` reads again only when the data changes or the screen regains focus. */
const readBackups = (db: Db) => ({ lastSnapshotAt: getSettings(db).lastSnapshotAt, latestPath: latestSnapshotPath() });

/** When the last good snapshot was written, and a way to send the newest one somewhere safe. Snapshots run in the phone app only. */
function BackupsSection() {
  const { lastSnapshotAt, latestPath } = useDbQuery(readBackups);
  const [shareFailed, setShareFailed] = useState(false);
  return (
    <View style={{ gap: 8, marginTop: 24 }}>
      <Body weight={600} muted>
        Backups
      </Body>
      {Platform.OS === 'web' ? (
        <Body>Backups run in the phone app.</Body>
      ) : (
        <>
          <Body>{lastSnapshotAt === null ? 'No snapshot yet.' : `Last snapshot: ${formatDateTime(lastSnapshotAt)}`}</Body>
          {latestPath !== null ? (
            <Button
              label="Share latest snapshot"
              variant="secondary"
              onPress={() => {
                setShareFailed(false);
                shareFile(latestPath).catch(() => setShareFailed(true));
              }}
            />
          ) : null}
          {shareFailed ? <Body muted>Couldn't open the share sheet.</Body> : null}
        </>
      )}
    </View>
  );
}

/** Settings so far: Appearance, Units, Bar, Rest timer and Backups. The rest arrive in later tasks. */
export default function Settings() {
  return (
    <Screen footer>
      <Display>Settings</Display>
      <View style={{ gap: 8, marginTop: 16 }}>
        <Body weight={600} muted>
          Appearance
        </Body>
        <AppearanceControl />
      </View>
      <UnitsSection />
      <BarSection />
      <RestTimerSection />
      <BackupsSection />
    </Screen>
  );
}
