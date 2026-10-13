import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { getSettings } from '../../src/db/repositories/settingsRepo';
import { applyImport, previewImport, type ImportPreview, type ImportResult } from '../../src/db/repositories/importRepo';
import { planImport, type ImportPlan, type SkippedRow } from '../../src/domain/importCsv';
import type { SampleKind } from '../../src/domain/importSamples';
import type { WeightUnit } from '../../src/domain/types';
import { announce } from '../../src/platform/announce';
import { useIsPro } from '../../src/platform/entitlements';
import { pickCsvFile, shareSample } from '../../src/platform/importFiles';
import { deviceLocale, deviceRegion } from '../../src/platform/locale';
import { bumpData } from '../../src/state/dataVersion';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { useOpenPaywall } from '../../src/ui/pro/openPaywall';
import { Screen } from '../../src/ui/Screen';
import { Segmented } from '../../src/ui/Segmented';
import { Body, Label, ScreenTitle } from '../../src/ui/Text';

/** Back to Settings, or there when nothing is behind this page. */
function toSettings() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

/** How many skipped rows and matched names are listed before "and N more". */
const LISTED = 12;

const count = (n: number, one: string, many: string) => `${n.toLocaleString(deviceLocale())} ${n === 1 ? one : many}`;

function dayText(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString(deviceLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
}

function spanText(first: string | null, last: string | null): string | null {
  if (first === null || last === null) return null;
  return first === last ? `On ${dayText(first)}.` : `From ${dayText(first)} to ${dayText(last)}.`;
}

/** A list of up to `LISTED` lines, then how many more there are. */
function Lines({ lines }: { lines: string[] }) {
  return (
    <View style={{ gap: 4 }}>
      {lines.slice(0, LISTED).map((line, i) => (
        <Body key={`${i}:${line}`} muted>
          {line}
        </Body>
      ))}
      {lines.length > LISTED ? <Body muted>{`and ${lines.length - LISTED} more`}</Body> : null}
    </View>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{title}</Label>
      {children}
    </View>
  );
}

/** "2 workouts were" or "1 food entry was". */
function nouns(kind: ImportPreview['kind'], n: number): string {
  const [one, many] = kind === 'workouts' ? ['workout', 'workouts'] : kind === 'body' ? ['body entry', 'body entries'] : ['food entry', 'food entries'];
  return `${count(n, one, many)} ${n === 1 ? 'was' : 'were'}`;
}

const skippedLines = (skipped: readonly SkippedRow[]) => skipped.map((s) => `Row ${s.row}: ${s.reason}`);

/** What the preview says will be added, in a line. */
function addsText(p: ImportPreview): string {
  if (p.kind === 'workouts') return p.workouts === 0 ? 'Nothing new to add.' : `${count(p.workouts, 'workout', 'workouts')} with ${count(p.sets, 'set', 'sets')}.`;
  const what = p.kind === 'body' ? ['body entry', 'body entries'] : ['food entry', 'food entries'];
  return p.entries === 0 ? 'Nothing new to add.' : `${count(p.entries, what[0], what[1])}.`;
}

type Shown =
  | { step: 'start'; message: string | null }
  | { step: 'preview'; name: string; text: string; plan: Exclude<ImportPlan, { kind: 'unknown' }>; preview: ImportPreview; unit: WeightUnit }
  | { step: 'done'; name: string; kind: ImportPreview['kind']; result: ImportResult; skipped: SkippedRow[] };

const SAMPLES: { kind: SampleKind; label: string }[] = [
  { kind: 'workouts', label: 'Workouts' },
  { kind: 'body', label: 'Body' },
  { kind: 'food', label: 'Food' },
];

/**
 * Settings → Import data (R565, Pro): bring workouts, body measurements and food from another app in a CSV file, so
 * leaving it loses nothing. Choose a file; GymHound reads what kind it is and shows what it would add first: how many
 * workouts and sets (and over which days), which exercise names match the library and which are added as your own,
 * the unit when the file doesn't say, and any rows it couldn't read, by row number. Import writes it all at once;
 * the summary says what was added. The sample files show the columns it reads.
 */
export default function ImportData() {
  const db = useDb();
  const pro = useIsPro();
  const openPaywall = useOpenPaywall();
  const [shown, setShown] = useState<Shown>({ step: 'start', message: null });
  const [busy, setBusy] = useState(false);

  const options = (unit?: WeightUnit) => {
    const settings = getSettings(db);
    return { weightUnit: unit ?? settings.unit, distanceUnit: settings.distanceUnit, dayFirst: deviceRegion() !== 'US' };
  };

  const read = (name: string, text: string, unit?: WeightUnit) => {
    const opts = options(unit);
    const plan = planImport(text, opts);
    if (plan.kind === 'unknown') {
      setShown({ step: 'start', message: `${name}: ${plan.reason}` });
      announce(plan.reason);
      return;
    }
    setShown({ step: 'preview', name, text, plan, preview: previewImport(db, plan), unit: opts.weightUnit });
  };

  const choose = () => {
    if (busy) return;
    setBusy(true);
    pickCsvFile()
      .then(
        (file) => {
          if (file === null) return;
          if ('tooBig' in file) {
            setShown({ step: 'start', message: `${file.name} is too big to import (over 20 MB).` });
            return;
          }
          read(file.name, file.text);
        },
        (error: unknown) => {
          console.warn('GymHound could not read the file.', error);
          setShown({ step: 'start', message: "Couldn't read that file. Try another, or save it again from the app it came from." });
        },
      )
      .finally(() => setBusy(false));
  };

  const doImport = () => {
    if (shown.step !== 'preview' || busy) return;
    setBusy(true);
    try {
      const result = applyImport(db, shown.plan, Date.now());
      bumpData();
      setShown({ step: 'done', name: shown.name, kind: shown.preview.kind, result, skipped: shown.plan.skipped });
      announce('Imported.');
    } catch (error) {
      console.warn('GymHound could not import the file.', error);
      setShown({ step: 'start', message: "Couldn't import that file. Nothing was added." });
    } finally {
      setBusy(false);
    }
  };

  const sample = (kind: SampleKind) => {
    shareSample(kind).then(
      (result) => {
        if (result === 'unavailable') setShown({ step: 'start', message: "This phone can't share files." });
      },
      (error: unknown) => {
        console.warn('GymHound could not share the sample.', error);
        setShown({ step: 'start', message: "Couldn't share the sample file." });
      },
    );
  };

  if (!pro) {
    return (
      <Screen>
        <BackLink label="Settings" onPress={toSettings} />
        <ScreenTitle>Import data</ScreenTitle>
        <View style={{ gap: 16, marginTop: 24 }}>
          <Body>Importing workouts, body measurements and food from another app is part of GymHound Pro.</Body>
          <Button label="See Pro" onPress={openPaywall} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackLink label="Settings" onPress={toSettings} />
      <ScreenTitle>Import data</ScreenTitle>
      <View style={{ gap: 24, marginTop: 24 }}>
        {shown.step === 'start' ? (
          <>
            <Body>
              Bring your history from another app in a CSV file: workouts, body measurements or food, one kind to a file. Exports from Strong, Hevy and FitNotes, and
              GymHound's own, read as they are.
            </Body>
            <View style={{ gap: 8 }}>
              <Button label="Choose a CSV file" disabled={busy} onPress={choose} />
              {shown.message !== null ? <Body muted>{shown.message}</Body> : null}
            </View>
            <Block title="What it reads">
              <Body muted>Workouts: a row for each set with its date, exercise, weight and reps (or time, or distance). A sets column counts for that many.</Body>
              <Body muted>Body: a date, then bodyweight, body fat, waist, chest, hips, arms, thighs or neck.</Body>
              <Body muted>Food: a date, the food, and its calories, protein, carbs and fat.</Body>
              <Body muted>Exercises are matched to GymHound's library. One it doesn't know is added as your own, so nothing is lost.</Body>
            </Block>
            <Block title="Sample files">
              <Body muted>The columns GymHound reads, with a row or two filled in. Save one, fill it in, then choose it here.</Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SAMPLES.map((s) => (
                  <Button key={s.kind} label={s.label} accessibilityLabel={`Sample ${s.label.toLowerCase()} file`} variant="secondary" size="compact" onPress={() => sample(s.kind)} />
                ))}
              </View>
            </Block>
          </>
        ) : null}

        {shown.step === 'preview' ? <Preview shown={shown} busy={busy} onUnit={(unit) => read(shown.name, shown.text, unit)} onImport={doImport} onAnother={choose} onCancel={() => setShown({ step: 'start', message: null })} /> : null}

        {shown.step === 'done' ? (
          <>
            <Block title="Imported">
              <Body weight={600}>{shown.name}</Body>
              <Body>
                {shown.result.added === 0
                  ? 'Nothing new was added.'
                  : shown.kind === 'workouts'
                    ? `Added ${count(shown.result.added, 'workout', 'workouts')} with ${count(shown.result.sets, 'set', 'sets')}. They're in History, and Stats counts them.`
                    : `Added ${count(shown.result.added, shown.kind === 'body' ? 'body entry' : 'food entry', shown.kind === 'body' ? 'body entries' : 'food entries')}.`}
              </Body>
              {shown.result.alreadyIn > 0 ? <Body muted>{`${nouns(shown.kind, shown.result.alreadyIn)} already in GymHound, so left out.`}</Body> : null}
            </Block>
            {shown.result.newExercises.length > 0 ? (
              <Block title="Added as your own exercises">
                <Lines lines={shown.result.newExercises} />
                {shown.result.noMuscle.length > 0 ? (
                  <Body muted>
                    {`${shown.result.noMuscle.length === 1 ? 'One says' : `${shown.result.noMuscle.length} say`} nothing of the muscles worked. Set them in its Edit exercise so Stats counts its sets.`}
                  </Body>
                ) : null}
              </Block>
            ) : null}
            {shown.skipped.length > 0 ? (
              <Block title="Rows left out">
                <Lines lines={skippedLines(shown.skipped)} />
              </Block>
            ) : null}
            <View style={{ gap: 8 }}>
              <Button label="Done" onPress={toSettings} />
              <Button label="Import another file" variant="secondary" disabled={busy} onPress={choose} />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Preview({
  shown,
  busy,
  onUnit,
  onImport,
  onAnother,
  onCancel,
}: {
  shown: Extract<Shown, { step: 'preview' }>;
  busy: boolean;
  onUnit: (unit: WeightUnit) => void;
  onImport: () => void;
  onAnother: () => void;
  onCancel: () => void;
}) {
  const { plan, preview } = shown;
  const kindName = plan.kind === 'workouts' ? 'Workouts' : plan.kind === 'body' ? 'Body measurements' : 'Food';
  const nothing = preview.kind === 'workouts' ? preview.workouts === 0 : preview.entries === 0;
  const span = spanText(preview.firstDate, preview.lastDate);
  const matched = preview.kind === 'workouts' ? preview.exercises.filter((e) => e.to !== null) : [];
  const added = preview.kind === 'workouts' ? preview.exercises.filter((e) => e.to === null) : [];
  return (
    <>
      <Block title={kindName}>
        <Body weight={600}>{shown.name}</Body>
        <Body>{addsText(preview)}</Body>
        {span !== null && !nothing ? <Body muted>{span}</Body> : null}
        {preview.alreadyIn > 0 ? <Body muted>{`${nouns(preview.kind, preview.alreadyIn)} already in GymHound, and will be left out.`}</Body> : null}
      </Block>
      {(plan.kind === 'workouts' || plan.kind === 'body') && !plan.weightUnitKnown && !nothing ? (
        <Block title="Weights in this file">
          <Body muted>The file doesn't say. Choose the unit it was kept in.</Body>
          <Segmented
            label="Weights in this file"
            options={[
              { value: 'lb', label: 'lb' },
              { value: 'kg', label: 'kg' },
            ]}
            value={shown.unit}
            onChange={(unit) => onUnit(unit as WeightUnit)}
          />
        </Block>
      ) : null}
      {matched.length > 0 ? (
        <Block title={`Matched to the library (${matched.length})`}>
          <Lines lines={matched.map((e) => (e.name.toLowerCase() === e.to!.name.toLowerCase() ? e.name : `${e.name} → ${e.to!.name}`))} />
        </Block>
      ) : null}
      {added.length > 0 ? (
        <Block title={`New, added as your own (${added.length})`}>
          <Lines lines={added.map((e) => e.name)} />
        </Block>
      ) : null}
      {plan.skipped.length > 0 ? (
        <Block title={`Rows that can't be read (${plan.skipped.length})`}>
          <Lines lines={skippedLines(plan.skipped)} />
        </Block>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button label="Import" disabled={nothing || busy} onPress={onImport} />
        <Button label="Choose another file" variant="secondary" disabled={busy} onPress={onAnother} />
        <Button label="Cancel" variant="quiet" onPress={onCancel} />
      </View>
    </>
  );
}
