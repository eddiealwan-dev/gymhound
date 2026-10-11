import { useRef, useState, type ReactElement } from 'react';
import { TextInput, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { deleteEntry, type FoodEntry, updateEntryServings, updateQuickAdd } from '../../db/repositories/foodLogRepo';
import { type EntryTotals, fuelNumber, type MacroInput, parseQuickAdd, parseServings, rescaleEntry, servingsText } from '../../domain/fuel';
import { parseDecimal } from '../../domain/input';
import { announce } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { BodyField, CheckLine } from '../fields';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { SheetTitle } from '../SheetTitle';
import { Body } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

/** "300 kcal · 60 g protein". */
function kcalProtein(t: EntryTotals, locale: string): string {
  return `${fuelNumber(t.kcal, locale)} kcal · ${fuelNumber(t.proteinG, locale)} g protein`;
}

/** The servings chips (R141): what each shows, what VoiceOver says, and its value. */
const CHIPS = [
  { label: '½', spoken: 'Half a serving', value: 0.5 },
  { label: '1', spoken: '1 serving', value: 1 },
  { label: '1½', spoken: '1.5 servings', value: 1.5 },
  { label: '2', spoken: '2 servings', value: 2 },
] as const;

type Panel = 'edit' | 'delete' | 'discard';

/** What an editor hands its sheet: save, and whether anything changed. */
type EditorHandle = { save(): 'saved' | 'unchanged' | 'invalid'; dirty(): boolean };

/** A food entry's servings (R142): the field, the chips and the live line, worked out from the entry's own totals. */
function ServingsEditor({ entry, locale, handle }: { entry: FoodEntry; locale: string; handle: React.MutableRefObject<EditorHandle | null> }) {
  const db = useDb();
  const initial = servingsText(entry.servings, locale);
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const parsed = parseServings(draft);

  // "1.50" is the 1.5 stored: only a different number, or one that doesn't read, is a change.
  const changed = draft !== initial && parsed !== entry.servings;

  handle.current = {
    dirty: () => changed,
    save: () => {
      if (!changed) return 'unchanged';
      if (parsed === null) {
        setInvalid(true);
        announce('Check this number');
        return 'invalid';
      }
      updateEntryServings(db, entry.id, parsed);
      bumpData();
      return 'saved';
    },
  };

  const change = (text: string) => {
    setDraft(text);
    setInvalid(false);
  };

  return (
    <View style={{ gap: 12, marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <BodyField value={draft} onChangeText={change} accessibilityLabel="Servings" invalid={invalid} />
        <Body muted style={{ flexShrink: 1 }}>
          {entry.servingLabel === null ? 'servings' : `× ${entry.servingLabel}`}
        </Body>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CHIPS.map((chip) => (
          <Button
            key={chip.label}
            label={chip.label}
            accessibilityLabel={chip.spoken}
            variant="secondary"
            size="compact"
            selected={parsed === chip.value}
            onPress={() => change(servingsText(chip.value, locale))}
          />
        ))}
      </View>
      <CheckLine shown={invalid} />
      {parsed !== null ? <Body muted>{kcalProtein(rescaleEntry(entry, parsed), locale)}</Body> : null}
    </View>
  );
}

const MACRO_FIELDS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', spoken: 'Calories', total: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g', spoken: 'Protein, grams', total: 'proteinG' },
  { key: 'carbs', label: 'Carbs', unit: 'g', spoken: 'Carbs, grams', total: 'carbsG' },
  { key: 'fat', label: 'Fat', unit: 'g', spoken: 'Fat, grams', total: 'fatG' },
] as const;

/** A quick add's name and its four numbers (R142, R143). */
function QuickAddEditor({ entry, locale, handle }: { entry: FoodEntry; locale: string; handle: React.MutableRefObject<EditorHandle | null> }) {
  const db = useDb();
  const { colors } = useTheme();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false });
  const [initial] = useState(() => ({
    name: entry.name,
    kcal: number.format(entry.kcal),
    protein: number.format(entry.proteinG),
    carbs: number.format(entry.carbsG),
    fat: number.format(entry.fatG),
  }));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof MacroInput | 'name' | 'form', string>>>({});

  // A number typed differently but the same ("600.0") is not a change.
  const fieldChanged = (key: keyof MacroInput) => draft[key] !== initial[key] && parseDecimal(draft[key]) !== parseDecimal(initial[key]);
  const dirty = () => draft.name !== initial.name || MACRO_FIELDS.some((f) => fieldChanged(f.key));

  handle.current = {
    dirty,
    save: () => {
      if (!dirty()) return 'unchanged';
      const result = parseQuickAdd(draft);
      if (!result.ok) {
        setErrors(result.errors);
        announce(result.errors.name ?? result.errors.form ?? 'Check this number');
        return 'invalid';
      }
      // A number left as it was keeps its stored value, not the field's rounding of it.
      const totals = { ...result.totals };
      for (const f of MACRO_FIELDS) if (!fieldChanged(f.key)) totals[f.total] = entry[f.total];
      updateQuickAdd(db, entry.id, result.name, totals);
      bumpData();
      return 'saved';
    },
  };

  const change = (key: keyof typeof initial, text: string) => {
    setDraft((d) => ({ ...d, [key]: text }));
    setErrors({});
  };

  return (
    <View style={{ gap: 12, marginBottom: 24 }}>
      <View style={{ gap: 4 }}>
        <Body muted>Name</Body>
        <TextInput
          value={draft.name}
          onChangeText={(text) => change('name', text)}
          accessibilityLabel="Name"
          placeholder="Quick add"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="sentences"
          returnKeyType="done"
          style={{
            minHeight: 48,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bg,
            color: colors.text,
            fontFamily: fonts.body400,
            fontSize: 16,
          }}
        />
        {errors.name ? <Body muted>{errors.name}</Body> : null}
      </View>
      {MACRO_FIELDS.map((f) => (
        <View key={f.key} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Body style={{ minWidth: 72 }}>{f.label}</Body>
            <BodyField
              value={draft[f.key]}
              onChangeText={(text) => change(f.key, text)}
              accessibilityLabel={f.spoken}
              invalid={errors[f.key] !== undefined}
            />
            <Body muted>{f.unit}</Body>
          </View>
          <CheckLine shown={errors[f.key] !== undefined} />
        </View>
      ))}
      {errors.form ? <Body muted>{errors.form}</Body> : null}
    </View>
  );
}

/**
 * Edits one entry of the food log (R142): a food entry's servings, rescaled from its own stored totals, or a quick
 * add's name and macros. **Delete** asks first; leaving with changes asks "Discard changes?". The questions take the
 * sheet's place, so no second sheet opens over it, and the editor stays mounted under them, hidden, so Keep or Keep
 * editing finds the draft as it was.
 */
function EntryEditor({
  entry,
  locale,
  onClose,
  requestClose,
}: {
  entry: FoodEntry;
  locale: string;
  onClose: () => void;
  requestClose: React.MutableRefObject<() => void>;
}) {
  const db = useDb();
  const [panel, setPanel] = useState<Panel>('edit');
  const handle = useRef<EditorHandle | null>(null);
  const quickAdd = entry.foodId === null;

  const cancel = () => (handle.current?.dirty() ? setPanel('discard') : onClose());
  // A tap outside the sheet or the back gesture: Cancel while editing; the safe answer while a question is open.
  requestClose.current = () => (panel === 'edit' ? cancel() : setPanel('edit'));

  const save = () => {
    const result = handle.current?.save() ?? 'unchanged';
    if (result === 'invalid') return;
    if (result === 'saved') announce(`Saved ${entry.name}.`);
    onClose();
  };

  const remove = () => {
    deleteEntry(db, entry.id);
    bumpData();
    announce(`Deleted ${entry.name}.`);
    onClose();
  };

  return (
    <>
      <View style={panel === 'edit' ? undefined : { display: 'none' }}>
        <SheetTitle>{entry.name}</SheetTitle>
        {quickAdd ? <QuickAddEditor entry={entry} locale={locale} handle={handle} /> : <ServingsEditor entry={entry} locale={locale} handle={handle} />}
        <View style={{ gap: 8 }}>
          <Button label="Save" onPress={save} />
          <Button label="Delete" variant="secondary" onPress={() => setPanel('delete')} />
          <Button label="Cancel" variant="quiet" onPress={cancel} />
        </View>
      </View>
      {panel === 'delete' ? (
        <>
          <SheetTitle>Delete this entry?</SheetTitle>
          <View style={{ gap: 8 }}>
            <Button label="Delete" onPress={remove} />
            <Button label="Keep" variant="secondary" onPress={() => setPanel('edit')} />
          </View>
        </>
      ) : null}
      {panel === 'discard' ? (
        <>
          <SheetTitle>Discard changes?</SheetTitle>
          <View style={{ gap: 8 }}>
            <Button label="Keep editing" onPress={() => setPanel('edit')} />
            <Button label="Discard" variant="secondary" onPress={onClose} />
          </View>
        </>
      ) : null}
    </>
  );
}

/** The sheet over Fuel for the entry tapped, or nothing when `entry` is null. */
export function FoodEntrySheet({ entry, locale, onClose }: { entry: FoodEntry | null; locale: string; onClose: () => void }): ReactElement {
  const requestClose = useRef<() => void>(onClose);
  // The last entry stays drawn while the sheet fades out, so no blank panel shows. Each opening counts, so opening the
  // same entry again starts a fresh editor from the entry as it now is.
  const [shown, setShown] = useState<{ entry: FoodEntry; opening: number; open: boolean } | null>(null);
  if (entry !== null && (shown === null || !shown.open || shown.entry !== entry)) {
    setShown({ entry, opening: (shown?.opening ?? 0) + 1, open: true });
  } else if (entry === null && shown?.open) {
    setShown({ ...shown, open: false });
  }
  const open = entry !== null;
  return (
    <Sheet visible={open} onClose={() => (open ? requestClose.current() : undefined)}>
      {shown === null ? null : (
        <EntryEditor
          key={shown.opening}
          entry={shown.entry}
          locale={locale}
          onClose={open ? onClose : () => undefined}
          requestClose={requestClose}
        />
      )}
    </Sheet>
  );
}
