import { useState } from 'react';
import { AccessibilityInfo, Image, View } from 'react-native';
import { useDb } from '../db/DbProvider';
import { setOwnPhoto, type PhotoSlot } from '../db/repositories/exercisePhotosRepo';
import { deleteExercisePhotoFile, pickPhoto, photoUri, saveExercisePhoto } from '../platform/exercisePhotoFiles';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';
import { useOwnPhotoNames } from './exercisePhotos';
import { afterSheetCloses, Sheet } from './Sheet';
import { Body, Display } from './Text';
import { useTheme } from './ThemeProvider';

const SLOTS: readonly { slot: PhotoSlot; label: string; spoken: string }[] = [
  { slot: 'start', label: 'Start photo', spoken: 'start photo' },
  { slot: 'end', label: 'End photo', spoken: 'end photo' },
];

const DENIED = 'Camera access is off. Turn it on in Settings to take a photo.';
const FAILED = "That photo couldn't be saved.";

/**
 * Your own start and end photos for an exercise with none bundled (R111), in the form demo and the exercise editor.
 * Each slot is empty with a compact **Add**, or a 120 × 80 thumbnail with **Replace** and **Remove**. Add and Replace
 * open a sheet (**Take photo**, **Choose a photo**, **Cancel**); the camera or the library opens once it has closed.
 * A new photo is stored by file name and the one it replaced is deleted; Remove deletes the file. A file that has gone
 * (a restored snapshot names files it does not hold) shows as an empty slot. Nothing shows for an exercise with bundled
 * photos, or on web (phone builds only).
 */
export function OwnPhotos({ exerciseId }: { exerciseId: string }) {
  const db = useDb();
  const { colors } = useTheme();
  const names = useOwnPhotoNames(exerciseId);
  /** The slot the sheet is choosing a photo for, or null while it is closed. */
  const [choosingFor, setChoosingFor] = useState<PhotoSlot | null>(null);
  /** The slot the sheet was last opened for, kept while it fades so its title does not empty. */
  const [sheetSlot, setSheetSlot] = useState<PhotoSlot>('start');
  /** Why the last try gave no photo: muted, under the slots. */
  const [message, setMessage] = useState<string | null>(null);

  if (names === null) return null;

  const say = (words: string) => {
    setMessage(words);
    // The live region speaks on Android only; VoiceOver is told here.
    AccessibilityInfo.announceForAccessibility(words);
  };

  const add = async (slot: PhotoSlot, source: 'camera' | 'library') => {
    let picked;
    try {
      picked = await pickPhoto(source);
    } catch {
      say(FAILED);
      return;
    }
    if (picked.status === 'denied') {
      say(DENIED);
      return;
    }
    if (picked.status === 'cancelled') return;
    const now = Date.now();
    let name: string;
    let replaced: string | null;
    try {
      name = saveExercisePhoto(picked.uri, exerciseId, slot, now);
    } catch {
      say(FAILED);
      return;
    }
    try {
      replaced = setOwnPhoto(db, exerciseId, slot, name, now);
    } catch {
      deleteExercisePhotoFile(name);
      say(FAILED);
      return;
    }
    if (replaced !== null) deleteExercisePhotoFile(replaced);
    bumpData();
  };

  const choose = (source: 'camera' | 'library') => {
    const slot = choosingFor;
    if (slot === null) return;
    setChoosingFor(null);
    setMessage(null);
    // The camera and the library are screens of their own, which iOS can't show while the sheet is going away.
    afterSheetCloses(() => void add(slot, source));
  };

  const remove = (slot: PhotoSlot) => {
    setMessage(null);
    const replaced = setOwnPhoto(db, exerciseId, slot, null, Date.now());
    if (replaced !== null) deleteExercisePhotoFile(replaced);
    bumpData();
  };

  const open = (slot: PhotoSlot) => {
    setSheetSlot(slot);
    setChoosingFor(slot);
  };

  return (
    <View style={{ gap: 16 }}>
      {SLOTS.map(({ slot, label, spoken }) => {
        const name = names[slot];
        return (
          <View key={slot} style={{ gap: 8 }}>
            <Body>{label}</Body>
            {name !== null ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <Image
                  source={{ uri: photoUri(name) }}
                  resizeMode="cover"
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={label}
                  accessibilityIgnoresInvertColors
                  style={{ width: 120, height: 80, borderRadius: 8, backgroundColor: colors.surfaceRaised }}
                />
                {/* 4pt inset keeps each pill's 4pt hit slop inside the row. */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 4, margin: -4 }}>
                  <Button label="Replace" size="compact" variant="secondary" accessibilityLabel={`Replace ${spoken}`} onPress={() => open(slot)} />
                  <Button label="Remove" size="compact" variant="secondary" accessibilityLabel={`Remove ${spoken}`} onPress={() => remove(slot)} />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row' }}>
                <Button label="Add" size="compact" variant="secondary" accessibilityLabel={`Add ${spoken}`} onPress={() => open(slot)} />
              </View>
            )}
          </View>
        );
      })}
      {message !== null ? (
        <Body muted accessibilityLiveRegion="polite">
          {message}
        </Body>
      ) : null}
      <Sheet visible={choosingFor !== null} onClose={() => setChoosingFor(null)}>
        <Display weight={700} style={{ marginBottom: 16 }}>
          {SLOTS.find((s) => s.slot === sheetSlot)?.label}
        </Display>
        <View style={{ gap: 8 }}>
          <Button label="Take photo" onPress={() => choose('camera')} />
          <Button label="Choose a photo" variant="secondary" onPress={() => choose('library')} />
          <Button label="Cancel" variant="secondary" onPress={() => setChoosingFor(null)} />
        </View>
      </Sheet>
    </View>
  );
}
