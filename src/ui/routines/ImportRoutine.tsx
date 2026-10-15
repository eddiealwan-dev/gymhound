import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { TextInput, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { importSharedRoutine, previewShared, sharedFromDecoded } from '../../db/repositories/routineShareRepo';
import { getRoutineDetail } from '../../db/repositories/routinesRepo';
import { decodeRoutine, PROGRAM_NOT_HERE, SHARE_CODE_ERRORS } from '../../domain/routineShare';
import { announce } from '../../platform/announce';
import { programById } from '../../seed/programs.generated';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { useRoutineLimit } from '../RoutineLimit';
import { Body, Label } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

/**
 * Add from code (§18.18, R466, R467): a field that takes a routine's code, its link or the whole message holding
 * either; once it reads, a preview (name, days, exercises, any exercise of the sender's own it will make, any it can't
 * find); then **Add routine**, which keeps to the free limit (R471) and opens the new routine. A code that doesn't
 * read says why in plain words (R470), once something has been pasted. `initial` fills the field (the link's page).
 * A code that names one of GymHound's programs (R472) adds nothing: every phone has the program, so **Open program**
 * opens it, free or Pro, and its page says whether it needs Pro; a retired one this phone never had says it is no
 * longer in GymHound (R601). Render it once; it draws the limit sheet itself.
 */
export function ImportRoutine({ initial = '', onCancel }: { initial?: string; onCancel: () => void }): ReactElement {
  const db = useDb();
  const { colors } = useTheme();
  const [text, setText] = useState(initial);
  const [failed, setFailed] = useState(false);
  const limit = useRoutineLimit();

  const decoded = useMemo(() => (text.trim() === '' ? null : decodeRoutine(text)), [text]);
  const program = useMemo(() => (decoded?.ok && decoded.premadeId !== null ? getRoutineDetail(db, decoded.premadeId) : null), [db, decoded]);
  const shared = useMemo(() => (decoded?.ok && decoded.premadeId === null ? sharedFromDecoded(db, decoded) : null), [db, decoded]);
  const preview = useMemo(() => (shared === null ? null : previewShared(db, shared)), [db, shared]);

  const add = () => {
    if (program !== null) {
      router.replace(`/routines/${program.id}`);
      return;
    }
    if (shared === null) return;
    limit.whenRoomFor(() => {
      setFailed(false);
      let routineId: string;
      try {
        routineId = importSharedRoutine(db, shared, Date.now()).routineId;
      } catch (error) {
        console.warn('GymHound could not add the shared routine.', error);
        setFailed(true);
        announce("Couldn't add the routine. Try again.");
        return;
      }
      bumpData();
      router.replace(`/routines/${routineId}`);
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <TextInput
        value={text}
        onChangeText={(value) => {
          setText(value);
          setFailed(false);
        }}
        accessibilityLabel="Routine code or link"
        placeholder="Paste the code or the link"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={{
          minHeight: 88,
          maxHeight: 160,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.bg,
          color: colors.text,
          fontFamily: fonts.body400,
          fontSize: 16,
          textAlignVertical: 'top',
        }}
      />
      {decoded !== null && !decoded.ok ? (
        <Body muted accessibilityLiveRegion="polite">
          {SHARE_CODE_ERRORS[decoded.error]}
        </Body>
      ) : null}
      {/* A program this phone doesn't have: a retired one, on a phone that never had it (R601). */}
      {decoded?.ok && decoded.premadeId !== null && program === null ? <Body muted>{PROGRAM_NOT_HERE}</Body> : null}
      {program !== null ? (
        <View
          testID="import-preview"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 4 }}
        >
          <Label>Program</Label>
          <Body weight={600}>{program.name}</Body>
          {/* A retired program is on Routines only while someone uses it (R598), so its preview says it is retired. */}
          <Body muted>
            {`${program.days.length} ${program.days.length === 1 ? 'day' : 'days'} · ${programById(program.id) ? 'already in your Routines' : 'retired. Open program shows its page.'}`}
          </Body>
        </View>
      ) : null}
      {preview !== null ? (
        <View
          testID="import-preview"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 4 }}
        >
          <Label>Routine</Label>
          <Body weight={600}>{preview.name}</Body>
          <Body muted>
            {`${preview.dayCount} ${preview.dayCount === 1 ? 'day' : 'days'} · ${preview.exerciseCount} ${preview.exerciseCount === 1 ? 'exercise' : 'exercises'}`}
          </Body>
          {preview.newExercises.length > 0 ? (
            <Body muted>{`Adds ${preview.newExercises.length === 1 ? 'an exercise' : 'exercises'} of their own: ${preview.newExercises.join(', ')}.`}</Body>
          ) : null}
          {preview.missingCount > 0 ? (
            <Body muted>{`${preview.missingCount} ${preview.missingCount === 1 ? "exercise isn't" : "exercises aren't"} in this version of GymHound, so ${preview.missingCount === 1 ? "it's" : "they're"} left out.`}</Body>
          ) : null}
        </View>
      ) : null}
      {failed ? <Body muted>Couldn't add the routine. Try again.</Body> : null}
      <View style={{ gap: 8, marginTop: 4 }}>
        <Button label={program !== null ? 'Open program' : 'Add routine'} disabled={preview === null && program === null} onPress={add} />
        <Button label="Cancel" variant="quiet" onPress={onCancel} />
      </View>
      {limit.sheets}
    </View>
  );
}
