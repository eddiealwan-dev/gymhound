import { useEffect, useRef, useState, type RefObject } from 'react';
import { Text, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { deleteBodyEntry, updateBodyEntry } from '../../db/repositories/bodyRepo';
import { BODY_LABELS, parseBodyValue, shownEntry, spokenFieldUnit } from '../../domain/body';
import type { BodyEntry } from '../../domain/body';
import type { LengthUnit } from '../../domain/types';
import { announce, focusOn } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Body } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';
import { BodyField, CheckLine } from '../fields';

/** A sheet title as ConfirmSheet draws it (Display 700), as a header VoiceOver can be moved to. */
function SheetTitle({ titleRef, children }: { titleRef: RefObject<Text | null>; children: string }) {
  const { colors } = useTheme();
  return (
    <Text ref={titleRef} accessibilityRole="header" style={{ fontFamily: fonts.display700, fontSize: 28, color: colors.text, marginBottom: 16 }}>
      {children}
    </Text>
  );
}

/** The sheet's content for one entry; keyed by the entry so its field starts from that entry's value. */
function EntryEditor({ entry, lengthUnit, title, onClose }: { entry: BodyEntry; lengthUnit: LengthUnit; title: string; onClose: () => void }) {
  const db = useDb();
  // A length opens in the chosen unit (to 0.1); every other entry in the unit it was logged in.
  const shown = shownEntry(entry, lengthUnit);
  // The value as stored when the unit is the same, as it was typed and not the one-decimal display, so an untouched Save changes nothing.
  const start = `${shown.value}`;
  const [draft, setDraft] = useState(start);
  const [invalid, setInvalid] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const titleRef = useRef<Text>(null);
  const firstRender = useRef(true);

  // When the sheet turns to the question (or back), VoiceOver moves to its new title rather than staying on a button
  // that has gone.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    focusOn(titleRef.current);
  }, [askDelete]);

  const save = () => {
    // Untouched, nothing is written, so a stored value is not checked again (an older one may sit outside the bounds).
    if (draft === start) {
      onClose();
      return;
    }
    const parsed = parseBodyValue(entry.kind, draft, shown.unit);
    if (!parsed.valid || parsed.value === null) {
      setInvalid(true);
      announce('Check this number');
      return;
    }
    if (parsed.value !== shown.value || shown.unit !== entry.unit) {
      updateBodyEntry(db, entry.kind, entry.id, parsed.value, shown.unit);
      bumpData();
    }
    onClose();
  };

  const remove = () => {
    deleteBodyEntry(db, entry.kind, entry.id);
    bumpData();
    onClose();
  };

  if (askDelete) {
    return (
      <>
        <SheetTitle titleRef={titleRef}>
          Delete this entry?
        </SheetTitle>
        <View style={{ gap: 8 }}>
          <Button label="Delete" onPress={remove} />
          <Button label="Keep" variant="secondary" onPress={() => setAskDelete(false)} />
        </View>
      </>
    );
  }

  return (
    <>
      <SheetTitle titleRef={titleRef}>
        {title}
      </SheetTitle>
      <View style={{ gap: 8, marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BodyField
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setInvalid(false);
            }}
            onSubmit={save}
            accessibilityLabel={`${title}, ${spokenFieldUnit(shown.unit)}`}
            invalid={invalid}
          />
          <Body muted>{shown.unit}</Body>
        </View>
        <CheckLine shown={invalid} />
      </View>
      <View style={{ gap: 8 }}>
        <Button label="Save" onPress={save} />
        <Button label="Delete" variant="secondary" accessibilityLabel="Delete entry" onPress={() => setAskDelete(true)} />
        <Button label="Cancel" variant="quiet" onPress={onClose} />
      </View>
    </>
  );
}

/**
 * Edits or deletes one body entry (R115): "{Label} on {date}", the value (a length in the chosen length unit, anything
 * else in the unit it was logged in), **Save**,
 * **Delete** (asked again in the sheet: "Delete this entry?" **Delete** / **Keep**) and **Cancel**. The date stays.
 */
export function BodyEntrySheet({
  entry,
  lengthUnit,
  dateLabel,
  onClose,
}: {
  entry: BodyEntry | null;
  lengthUnit: LengthUnit;
  dateLabel: string;
  onClose: () => void;
}) {
  return (
    <Sheet visible={entry !== null} onClose={onClose}>
      {entry ? <EntryEditor key={entry.id} entry={entry} lengthUnit={lengthUnit} title={`${BODY_LABELS[entry.kind]} on ${dateLabel}`} onClose={onClose} /> : null}
    </Sheet>
  );
}
