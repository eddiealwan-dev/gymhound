import { router } from 'expo-router';
import { useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { useLargeText } from '../../src/ui/largeText';
import { getFuelTargets } from '../../src/db/repositories/foodLogRepo';
import { getSettings, setSetting } from '../../src/db/repositories/settingsRepo';
import { switchDisplayUnit } from '../../src/db/repositories/unitsRepo';
import type { Db } from '../../src/db/types';
import { formatDateTime, formatRest } from '../../src/domain/dates';
import { caloriesSpoken, gramsSpoken, kcalProteinText } from '../../src/domain/fuel';
import { REST_CHOICES } from '../../src/domain/rest';
import { formatWeight } from '../../src/domain/units';
import type { BellSound, DistanceUnit, LengthUnit, Macros, ThemePreference, WeightUnit } from '../../src/domain/types';
import { announce } from '../../src/platform/announce';
import { debugUnlockAllowed, entitlementsFor, useEntitlementsState } from '../../src/platform/entitlements';
import { buildStamp } from '../../src/platform/buildStamp';
import { exportBodyCsv, exportFoodCsv, exportWorkoutsCsv } from '../../src/platform/exportFiles';
import { playBell } from '../../src/platform/restTimer/bell';
import { shareFile, snapshotFolderReport, snapshotListing } from '../../src/state/backup';
import { bumpData, useDataVersion, useDbQuery } from '../../src/state/dataVersion';
import { BarPicker } from '../../src/ui/BarPicker';
import { Button } from '../../src/ui/Button';
import { HealthSettings } from '../../src/ui/native/HealthSettings';
import { PlatesEditor } from '../../src/ui/PlatesEditor';
import { RestNotificationAccess } from '../../src/ui/RestNotificationAccess';
import { useOpenPaywall } from '../../src/ui/pro/openPaywall';
import { PURCHASES_UNAVAILABLE, useStoreAction } from '../../src/ui/pro/useStoreAction';
import { Screen } from '../../src/ui/Screen';
import { Segmented } from '../../src/ui/Segmented';
import { Body, Label, ScreenTitle } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Toggle } from '../../src/ui/Toggle';
import { readTesterEntries, testerText } from '../../src/domain/testerQuestions';
import { isTesterBuild } from '../../src/platform/runtime';
import { deviceLocale } from '../../src/platform/locale';
import { FEEDBACK_EMAIL, openFeedbackEmail } from '../../src/platform/feedback';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const WEIGHT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
];

const DISTANCE_OPTIONS: { value: Extract<DistanceUnit, 'mi' | 'km'>; label: string }[] = [
  { value: 'mi', label: 'mi' },
  { value: 'km', label: 'km' },
];

/** For body measurements (R639b); VoiceOver reads the words in full. */
const LENGTH_OPTIONS: { value: LengthUnit; label: string; spoken: string }[] = [
  { value: 'in', label: 'in', spoken: 'inches' },
  { value: 'cm', label: 'cm', spoken: 'centimetres' },
];

const BELL_OPTIONS: { value: BellSound; label: string }[] = [
  { value: 'bell', label: 'Bell' },
  { value: 'chime', label: 'Chime' },
  { value: 'ding', label: 'Ding' },
];

/** The bell volumes Settings offers, as the player's 0 to 1. */
const BELL_VOLUMES = [0.25, 0.5, 0.75, 1];

/** The rest lengths Settings offers. Off is not one: it belongs to an exercise (its ⋯ menu), not to every exercise. */
const REST_LENGTHS = REST_CHOICES.filter((seconds) => seconds > 0);

/** Light, Dark or System. The choice is stored, and the theme provider re-reads it. */
function AppearanceControl() {
  const db = useDb();
  const current = useDbQuery(getSettings).theme;
  return (
    <Segmented
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
 * A group of settings under its heading (the shared upper-case Label, read as a heading). The heading sits 8pt over
 * its first item; the items are 16pt apart, so a field's label is closer to its own control than to the one above it.
 * The page puts 32pt between groups.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{title}</Label>
      <View style={{ gap: 16 }}>{children}</View>
    </View>
  );
}

/** A setting's name over its control, 8pt apart. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Body>{label}</Body>
      {children}
    </View>
  );
}

/**
 * The display unit for weights (switching follows spec 7.1: only the setting changes, and plans convert when a workout
 * starts), the unit for distances and the unit for body measurements (inches or centimetres; it goes with the weight
 * unit until the lifter picks one, and then it stays theirs).
 */
function UnitsSection() {
  const db = useDb();
  const { unit, distanceUnit, lengthUnit } = useDbQuery(getSettings);
  return (
    <Section title="Units">
      <Field label="Weight">
        <Segmented
          label="Weight"
          options={WEIGHT_OPTIONS}
          value={unit}
          onChange={(value) => {
            switchDisplayUnit(db, value);
            setSetting(db, 'unitsChosen', true);
            bumpData();
          }}
        />
      </Field>
      <Field label="Distance">
        <Segmented
          label="Distance"
          options={DISTANCE_OPTIONS}
          value={distanceUnit}
          onChange={(value) => {
            setSetting(db, 'distanceUnit', value);
            setSetting(db, 'unitsChosen', true);
            bumpData();
          }}
        />
      </Field>
      <Field label="Length">
        <Segmented
          label="Length"
          options={LENGTH_OPTIONS}
          value={lengthUnit}
          onChange={(value) => {
            setSetting(db, 'lengthUnit', value);
            bumpData();
          }}
        />
      </Field>
    </Section>
  );
}

/** The bar for the display unit, under a muted line that says what it is for. */
function BarSection() {
  return (
    <Section title="Bar">
      <View style={{ gap: 8 }}>
        <Body muted>Used by the plate calculator.</Body>
        <BarPicker />
      </View>
    </Section>
  );
}

/** The plate pairs owned for the display unit, edited as the bar is (R107). */
function PlatesSection() {
  return (
    <Section title="Plates">
      <PlatesEditor />
    </Section>
  );
}

/** The default increments Settings offers for each unit. */
const INCREMENT_CHOICES: Record<WeightUnit, number[]> = { lb: [2.5, 5, 10], kg: [1, 1.25, 2.5, 5] };

const INCREMENT_KEY = { lb: 'defaultIncrementLb', kg: 'defaultIncrementKg' } as const;

/**
 * The increment a new exercise in a routine starts with, for the display unit (spec 8.11, R124): the choices in one
 * row, with a stored value that is not one of them (from a restored backup) kept in its place. The current one is
 * filled with `text`, and the screen reader says it is selected.
 */
function IncrementControl({ unit, value, onChange }: { unit: WeightUnit; value: number; onChange: (increment: number) => void }) {
  const { colors } = useTheme();
  const large = useLargeText();
  const base = INCREMENT_CHOICES[unit];
  const choices = base.includes(value) || !(value > 0) ? base : [...base, value].sort((a, b) => a - b);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 4 }}>
      {choices.map((increment) => {
        const selected = increment === value;
        const label = formatWeight(increment, unit);
        return (
          <Pressable
            key={increment}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(increment)}
            // At large text each is as wide as its label, so "1.25 kg" never spills out (Round 13).
            style={{
              flexGrow: 1,
              flexBasis: large ? 'auto' : 64,
              paddingHorizontal: large ? 12 : 0,
              minHeight: 44,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.text : 'transparent',
            }}
          >
            <Body weight={600} style={{ color: selected ? colors.bg : colors.text, fontVariant: ['tabular-nums'] }}>
              {label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The default increment for the display unit, as Bar and Plates are edited: the other unit keeps its own. */
function ProgressionSection() {
  const db = useDb();
  const settings = useDbQuery(getSettings);
  const unit = settings.unit;
  return (
    <Section title="Progression">
      <Field label="Default increment">
        <View style={{ gap: 8 }}>
          <Body muted>New exercises in a routine start with this. Change any one in the routine editor.</Body>
          <IncrementControl
            unit={unit}
            value={settings[INCREMENT_KEY[unit]]}
            onChange={(increment) => {
              setSetting(db, INCREMENT_KEY[unit], increment);
              bumpData();
            }}
          />
        </View>
      </Field>
    </Section>
  );
}

/**
 * The rest length every exercise on Default uses, as the segmented pill in rows of three: 0:30 to 5:00. The current one
 * is filled with `text`, and the screen reader says it is selected.
 */
function RestLengthControl({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const { colors } = useTheme();
  const large = useLargeText();
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
              flexBasis: large ? 'auto' : '30%',
              paddingHorizontal: large ? 12 : 0,
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

/**
 * How loud the in-app bell plays: 25%, 50%, 75% or 100%, in one row. The current one is filled with `text`, and the
 * screen reader says it is selected.
 */
function BellVolumeControl({ value, onChange }: { value: number; onChange: (volume: number) => void }) {
  const { colors } = useTheme();
  const large = useLargeText();
  return (
    // One row, or at large text as many as the labels need: "100%" ran off the screen (Round 13).
    <View style={{ flexDirection: 'row', flexWrap: large ? 'wrap' : 'nowrap', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 4 }}>
      {BELL_VOLUMES.map((volume) => {
        const selected = volume === value;
        const label = `${Math.round(volume * 100)}%`;
        return (
          <Pressable
            key={volume}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(volume)}
            style={{
              flexGrow: 1,
              flexShrink: large ? 0 : 1,
              flexBasis: large ? 'auto' : 0,
              paddingHorizontal: large ? 12 : 0,
              minHeight: 44,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.text : 'transparent',
            }}
          >
            <Body weight={600} style={{ color: selected ? colors.bg : colors.text, fontVariant: ['tabular-nums'] }}>
              {label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The rest timer length, whether the timer rings when it ends, which sound it makes and how loud. Choosing a sound or a
 * volume plays the bell once, as it will ring.
 */
function RestTimerSection() {
  const db = useDb();
  const { restSeconds, restBell, restBellSound, restBellVolume } = useDbQuery(getSettings);
  return (
    <Section title="Rest timer">
      <Field label="Length">
        <RestLengthControl
          value={restSeconds}
          onChange={(seconds) => {
            setSetting(db, 'restSeconds', seconds);
            bumpData();
          }}
        />
      </Field>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
        <Body style={{ flexShrink: 1 }}>Bell at the end</Body>
        <Toggle
          accessibilityLabel="Bell at the end"
          value={restBell}
          onValueChange={(value) => {
            setSetting(db, 'restBell', value);
            bumpData();
          }}
        />
      </View>
      {/* The lock-screen notification: why it's wanted, or where to turn it on (R410). Nothing once it's allowed. */}
      <RestNotificationAccess />
      <Field label="Bell sound">
        <Segmented
          label="Bell sound"
          options={BELL_OPTIONS}
          value={restBellSound}
          onChange={(value) => {
            setSetting(db, 'restBellSound', value);
            bumpData();
            void playBell(value, restBellVolume);
          }}
        />
      </Field>
      <Field label="Bell volume">
        <BellVolumeControl
          value={restBellVolume}
          onChange={(volume) => {
            setSetting(db, 'restBellVolume', volume);
            bumpData();
            void playBell(restBellSound, volume);
          }}
        />
      </Field>
    </Section>
  );
}

/** Taps closer together than this open Targets once. */
const ONCE_MS = 1000;

/** One day's targets as Settings shows them: calories and protein, whole numbers with separators (R156). */
function TargetLine({ day, macros }: { day: 'Training day' | 'Rest day'; macros: Macros }) {
  const amounts = { kcal: macros.kcal, proteinG: macros.protein };
  // Spoken in words, singular for exactly 1 as shown (rounded): "1 calorie", "1 gram of protein".
  return (
    <Body accessibilityLabel={`${day}: ${caloriesSpoken(amounts.kcal)}, ${gramsSpoken(amounts.proteinG)} of protein`}>
      {`${day}: ${kcalProteinText(amounts)}`}
    </Body>
  );
}

/**
 * Fuel targets (§8.11, R145). With Pro and targets: each day's calories and protein, and a secondary **Edit targets**;
 * with Pro and none: "No targets yet." and a filled **Set targets** (the only action); both open Fuel → Targets, once per tap. Without Pro
 * (free, or lapsed with targets kept, §9): a line saying targets are Pro, and **See Pro**, which opens the paywall.
 * It follows Pro as it turns on or off, with the screen open.
 */
function FuelSection() {
  const { isPro } = useEntitlementsState();
  const targets = useDbQuery(getFuelTargets) ?? null;
  const openPaywall = useOpenPaywall();
  const lastOpen = useRef(-Infinity);
  const openTargets = () => {
    const now = Date.now();
    if (now - lastOpen.current < ONCE_MS) return;
    lastOpen.current = now;
    router.push('/fuel-targets');
  };
  return (
    <View testID="settings-fuel">
      <Section title="Fuel">
        {!isPro ? (
          <View style={{ gap: 8 }}>
            <Body>Fuel targets are part of GymHound Pro.</Body>
            <Button label="See Pro" variant="secondary" onPress={openPaywall} />
          </View>
        ) : targets === null ? (
          <View style={{ gap: 8 }}>
            <Body>No targets yet.</Body>
            <Button label="Set targets" onPress={openTargets} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <TargetLine day="Training day" macros={targets.training} />
            <TargetLine day="Rest day" macros={targets.rest} />
            <Button label="Edit targets" variant="secondary" onPress={openTargets} />
          </View>
        )}
      </Section>
    </View>
  );
}

/** Module-level, so `useDbQuery` reads again only when the data changes or the screen regains focus (after a finish, too). */
const readBackups = (db: Db) => {
  const { lastSnapshotAt, lastSnapshotError } = getSettings(db);
  return { lastSnapshotAt, lastSnapshotError, listing: snapshotListing(), folderReport: __DEV__ ? snapshotFolderReport() : null };
};

/** Shown when the share sheet can't open, for a backup copy or an export. */
const SHARE_FAILED = "Couldn't open the share sheet. Try again.";

/**
 * When the last good snapshot was written, and a way to save a copy of the newest one somewhere safe, with a line saying
 * the copy is for restoring GymHound and opens nowhere else (Task 27). Snapshots run in the phone app only.
 * Below the time, a line says why the last snapshot failed, or that a saved snapshot's file isn't listed (with the
 * listing's error and the phone's raw listing of the folder in development builds), so a missing Save a backup copy
 * button can be explained.
 */
function BackupsSection() {
  const { lastSnapshotAt, lastSnapshotError, listing, folderReport } = useDbQuery(readBackups);
  const [shareFailed, setShareFailed] = useState(false);
  const latestPath = listing.path;
  const failedSinceLastGood = lastSnapshotError !== null && (lastSnapshotAt === null || lastSnapshotError.at > lastSnapshotAt);
  return (
    <Section title="Backups">
      {Platform.OS === 'web' ? (
        <Body>Backups run in the phone app.</Body>
      ) : (
        <View style={{ gap: 8 }}>
          <Body>{lastSnapshotAt === null ? 'No snapshot yet.' : `Last snapshot: ${formatDateTime(lastSnapshotAt)}`}</Body>
          {failedSinceLastGood ? (
            <Body>{`The last snapshot failed: ${lastSnapshotError.message} (${formatDateTime(lastSnapshotError.at)}).`}</Body>
          ) : null}
          {lastSnapshotAt !== null && latestPath === null ? (
            <>
              <Body>{`A snapshot was saved at ${formatDateTime(lastSnapshotAt)}, but its file isn't listed.`}</Body>
              {__DEV__ ? (
                <Body muted selectable>
                  {[listing.error, folderReport].filter((line) => line !== null).join('\n')}
                </Body>
              ) : null}
            </>
          ) : null}
          {latestPath !== null ? (
            <>
              <Button
                label="Save a backup copy"
                variant="secondary"
                onPress={() => {
                  setShareFailed(false);
                  shareFile(latestPath).catch((error: unknown) => {
                    console.warn('GymHound could not share the backup copy.', error);
                    setShareFailed(true);
                  });
                }}
              />
              <Body muted>A backup file for restoring GymHound. Keep it in Files or iCloud Drive; it won't open in other apps.</Body>
            </>
          ) : null}
          {shareFailed ? <Body muted>{SHARE_FAILED}</Body> : null}
        </View>
      )}
    </Section>
  );
}

/** The three exports: what each button says and runs, and its line when there is nothing to export. */
const EXPORTS = {
  workouts: { label: 'Export workouts (CSV)', run: exportWorkoutsCsv, empty: 'No finished workouts yet.' },
  food: { label: 'Export food (CSV)', run: exportFoodCsv, empty: 'No food logged yet.' },
  body: { label: 'Export body (CSV)', run: exportBodyCsv, empty: 'No body entries yet.' },
} as const;

type ExportKind = keyof typeof EXPORTS;

/**
 * The finished workouts, the food log and the body entries as CSV files (spec §11, R183) through the share sheet, to
 * open in Numbers or Excel. The food CSV is free and stays after Pro lapses (§9, R153); the body CSV is free. Phone
 * app only, like Backups. A muted line under the button pressed says when there is nothing to export or the share
 * sheet couldn't open, and the screen reader is told it. The line belongs to the data version it was shown at, so a
 * write since (a finished workout, a logged food) drops it. While an export runs, all three buttons are faded and
 * presses are ignored, so a second tap as the share sheet opens doesn't start a second export.
 */
function ExportSection() {
  const db = useDb();
  const version = useDataVersion((state) => state.version);
  const [message, setMessage] = useState<{ kind: ExportKind; text: string; version: number } | null>(null);
  const exporting = useRef(false);
  const [busy, setBusy] = useState(false);
  const start = (kind: ExportKind) => {
    if (exporting.current) return;
    exporting.current = true;
    setBusy(true);
    setMessage(null);
    const show = (text: string | null) => {
      setMessage(text === null ? null : { kind, text, version });
      if (text !== null) announce(text);
    };
    EXPORTS[kind]
      .run(db, Date.now())
      .then(
        (result) => show(result === 'empty' ? EXPORTS[kind].empty : result === 'unavailable' ? SHARE_FAILED : null),
        (error: unknown) => {
          console.warn('GymHound could not export the CSV.', error);
          show(SHARE_FAILED);
        },
      )
      .finally(() => {
        exporting.current = false;
        setBusy(false);
      });
  };
  return (
    <Section title="Export">
      {Platform.OS === 'web' ? (
        <Body>Export runs in the phone app.</Body>
      ) : (
        (Object.keys(EXPORTS) as ExportKind[]).map((kind) => (
          <View key={kind} style={{ gap: 8 }}>
            <Button label={EXPORTS[kind].label} variant="secondary" disabled={busy} onPress={() => start(kind)} />
            {message !== null && message.kind === kind && message.version === version ? <Body muted>{message.text}</Body> : null}
          </View>
        ))
      )}
    </Section>
  );
}

/**
 * Import (R565, Pro): bring workouts, body measurements and food from another app. **Import data** opens its page,
 * which on free says it is part of Pro, with See Pro; this says so too.
 */
function ImportSection() {
  const { isPro } = useEntitlementsState();
  return (
    <Section title="Import">
      <View style={{ gap: 8 }}>
        <Body>Bring your workouts, body measurements and food from another app, in a CSV file.</Body>
        <Button label="Import data" variant="secondary" onPress={() => router.push('/import')} />
        {!isPro ? <Body muted>Part of GymHound Pro.</Body> : null}
      </View>
    </Section>
  );
}

/**
 * GymHound Pro (§8.11, R138): whether Pro is on (from the store, or only for testing), or what it adds with **See Pro**
 * (the paywall, once per tap); and **Restore purchases**, always, saying what happened as the paywall does. With no
 * store in the build, Restore purchases is disabled under one line. A store subscription adds a quiet **Manage
 * subscription**, which opens the store's own page.
 */
function ProSection() {
  const db = useDb();
  const { isPro, isDebugPro, canRestore, subscribed: storeSubscription, kind } = useEntitlementsState();
  const { busy, status, run } = useStoreAction();
  const openPaywall = useOpenPaywall();
  const subscribed = kind === 'revenuecat' && canRestore && isPro && !isDebugPro && storeSubscription;
  return (
    <Section title="GymHound Pro">
      {isPro ? (
        <Body>{isDebugPro ? 'Pro is on for testing.' : 'Pro is on.'}</Body>
      ) : (
        <View style={{ gap: 8 }}>
          <Body>Free includes five programs, Stats and logging. Pro adds every program, your own routines, saved workouts and Fuel.</Body>
          <Button label="See Pro" onPress={openPaywall} />
        </View>
      )}
      <View style={{ gap: 8 }}>
        <Button label="Restore purchases" variant="secondary" disabled={!canRestore || busy} onPress={() => run('restore')} />
        {!canRestore ? <Body muted>{PURCHASES_UNAVAILABLE}</Body> : null}
        {status !== null ? <Body muted>{status}</Body> : null}
        {subscribed ? (
          <Button
            label="Manage subscription"
            variant="quiet"
            onPress={() => {
              entitlementsFor(db)
                .manageSubscription()
                .catch(() => false);
            }}
          />
        ) : null}
      </View>
    </Section>
  );
}

/**
 * Feedback (R570): **Send feedback** opens the phone's mail app with a new email to GymHound, its subject and a short
 * prompt filled in. No form in the app. With no mail app to take it, the address is shown to write to instead.
 */
function FeedbackSection() {
  const [unavailable, setUnavailable] = useState(false);
  return (
    <Section title="Feedback">
      <Body muted>Found a bug, or have an idea? Tell us. It opens an email in your mail app.</Body>
      <Button
        label="Send feedback"
        variant="secondary"
        onPress={() => {
          setUnavailable(false);
          void openFeedbackEmail().then((result) => {
            if (result === 'unavailable') {
              setUnavailable(true);
              announce(`Couldn't open Mail. Write to ${FEEDBACK_EMAIL}.`);
            }
          });
        }}
      />
      {unavailable ? <Body muted selectable>{`Couldn't open Mail. Write to ${FEEDBACK_EMAIL}.`}</Body> : null}
    </Section>
  );
}

/**
 * The Pro debug switch (§9, R126), for testing Pro before it can be bought: it turns Pro on through the app's one
 * entitlements object, so the routine limit on every screen hears it at once. It shows the debug unlock itself, not
 * whether Pro is on, so it can still be turned off where Pro was also bought. Shown only where the debug unlock is
 * allowed: a development build, or one that sets EXPO_PUBLIC_DEBUG_UNLOCK=1.
 */
function DeveloperSection() {
  const db = useDb();
  const entitlements = entitlementsFor(db);
  // Heard so the switch redraws when the unlock changes; the switch shows the stored setting.
  useSyncExternalStore(entitlements.subscribe, entitlements.isDebugPro);
  const { proDebugUnlock: unlocked, reviewLastCheck } = useDbQuery(getSettings);
  return (
    <Section title="Developer">
      <BuildLine />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
        <Body style={{ flexShrink: 1 }}>Unlock Pro for testing</Body>
        <Toggle
          accessibilityLabel="Unlock Pro for testing"
          value={unlocked}
          onValueChange={(value) => {
            entitlements.setDebugUnlock(value);
            bumpData();
          }}
        />
      </View>
      {/* What the rating rules said at the last finish (R587), since the store's prompt may not show here. */}
      <Body muted testID="review-last-check">{`Rating prompt: ${reviewLastCheck ?? 'no workout finished yet.'}`}</Body>
      {/* The rule test (R581): three still screens, then the questions, for checking the rule is understood. */}
      <Button label="Rule test" variant="secondary" onPress={() => router.push('/rule-test')} />
    </Section>
  );
}

/**
 * Test answers (R594), only in a tester build: how many sets of answers are saved, and Send test answers, which shares
 * them as text through the phone's share sheet. Nothing leaves the phone unless the tester sends it.
 */
function TestAnswersSection() {
  const entries = readTesterEntries(useDbQuery(getSettings).testerAnswers);
  return (
    <Section title="Test answers">
      <Body muted>
        {entries.length === 0
          ? 'Questions come up after your 2nd and 3rd finished workouts.'
          : `${entries.length} ${entries.length === 1 ? 'set' : 'sets'} of answers saved. Send them to GymHound when you're asked.`}
      </Body>
      <Button
        label="Send test answers"
        variant="secondary"
        onPress={() => {
          Share.share({ message: testerText(entries, deviceLocale()) }).catch((error: unknown) => console.warn('GymHound could not share the test answers.', error));
        }}
      />
    </Section>
  );
}

/**
 * Which build the phone is running (R540): the commit and its date, to match against what the PC printed before a phone
 * check. Selectable, so it can be copied into a note.
 */
function BuildLine() {
  const build = buildStamp();
  return (
    <Body muted selectable testID="build-stamp">
      {build === null ? 'Build: not known' : `Build ${build.commit} · ${build.date}`}
    </Body>
  );
}

/**
 * Settings so far: Appearance, Units, Bar, Plates, Progression, Rest timer, Fuel, Backups, Health, Export, Import,
 * GymHound Pro, Feedback, and Developer where the debug unlock is allowed.
 */
export default function Settings() {
  return (
    <Screen footer>
      <ScreenTitle>Settings</ScreenTitle>
      {/* 24pt under the title, then 32pt between groups: more room above a heading than under it. */}
      <View style={{ gap: 32, marginTop: 24 }}>
        <Section title="Appearance">
          <AppearanceControl />
        </Section>
        <UnitsSection />
        <BarSection />
        <PlatesSection />
        <ProgressionSection />
        <RestTimerSection />
        <FuelSection />
        <BackupsSection />
        <HealthSettings />
        <ExportSection />
        <ImportSection />
        <ProSection />
        <FeedbackSection />
        {isTesterBuild() ? <TestAnswersSection /> : null}
        {debugUnlockAllowed() ? <DeveloperSection /> : null}
      </View>
    </Screen>
  );
}
