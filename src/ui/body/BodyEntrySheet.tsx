import { useState } from 'react';
import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { deleteBodyEntry, updateBodyEntry } from '../../db/repositories/bodyRepo';
import { BODY_LABELS, parseBodyValue } from '../../domain/body';
import type { BodyEntry } from '../../domain/body';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Body, Display } from '../Text';
import { BodyField } from './BodyLog';

/** The sheet's content for one entry; keyed by the entry so its field starts from that entry's value. */
function EntryEditor({ entry, title, onClose }: { entry: BodyEntry; title: string; onClose: () => void }) {
  const db = useDb();
  // The stored value as it was typed, not the one-decimal display, so an untouched Save changes nothing.
  const [draft, setDraft] = useState(`${entry.value}`);
  const [invalid, setInvalid] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  const save = () => {
    const parsed = parseBodyValue(entry.kind, draft, entry.unit);
    if (!parsed.valid || parsed.value === null) {
      setInvalid(true);
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
        <Display style={{ marginBottom: 16 }}>Delete this entry?</Display>
        <View style={{ gap: 8 }}>
          <Button label="Delete" onPress={remove} />
          <Button label="Keep" variant="secondary" onPress={() => setAskDelete(false)} />
        </View>
      </>
    );
  }

  return (
    <>
      <Display style={{ marginBottom: 16 }}>{title}</Display>
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
        {invalid ? <Body muted>Check this number</Body> : null}
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
