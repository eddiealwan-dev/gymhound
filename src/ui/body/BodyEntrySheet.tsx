import { useEffect, useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { deleteBodyEntry, updateBodyEntry } from '../../db/repositories/bodyRepo';
import { BODY_LABELS, parseBodyValue } from '../../domain/body';
import type { BodyEntry } from '../../domain/body';
import { announce } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Body } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';
import { BodyField, CheckLine } from './BodyLog';

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
function EntryEditor({ entry, title, onClose }: { entry: BodyEntry; title: string; onClose: () => void }) {
  const db = useDb();
  // The stored value as it was typed, not the one-decimal display, so an untouched Save changes nothing.
  const [draft, setDraft] = useState(`${entry.value}`);
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
    if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
  }, [askDelete]);

  const save = () => {
    // Untouched, nothing is written, so a stored value is not checked again (an older one may sit outside the bounds).
    if (draft === `${entry.value}`) {
      onClose();
      return;
    }
    const parsed = parseBodyValue(entry.kind, draft, entry.unit);
    if (!parsed.valid || parsed.value === null) {
      setInvalid(true);
      announce('Check this number');
      return;
    }
    if (parsed.value !== entry.value) {
      updateBodyEntry(db, entry.kind, entry.id, parsed.value, entry.unit);
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
            accessibilityLabel={`${title}, ${entry.unit}`}
            invalid={invalid}
          />
          <Body muted>{entry.unit}</Body>
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
 * Edits or deletes one body entry (R115): "{Label} on {date}", the value in the unit it was logged in, **Save**,
 * **Delete** (asked again in the sheet: "Delete this entry?" **Delete** / **Keep**) and **Cancel**. The date stays.
 */
export function BodyEntrySheet({ entry, dateLabel, onClose }: { entry: BodyEntry | null; dateLabel: string; onClose: () => void }) {
  return (
    <Sheet visible={entry !== null} onClose={onClose}>
      {entry ? <EntryEditor key={entry.id} entry={entry} title={`${BODY_LABELS[entry.kind]} on ${dateLabel}`} onClose={onClose} /> : null}
    </Sheet>
  );
}
