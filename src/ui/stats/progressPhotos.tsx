import { useState } from 'react';
import { Keyboard, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { addProgressPhoto, listProgressPhotos, type ProgressPhoto } from '../../db/repositories/progressPhotosRepo';
import type { Db } from '../../db/types';
import { announce } from '../../platform/announce';
import { deleteProgressPhotoFile, pickProgressPhoto, progressPhotoExists, saveProgressPhoto } from '../../platform/progressPhotoFiles';
import { bumpData, useFocusedDbQuery } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { Button } from '../Button';
import { afterSheetCloses, Sheet } from '../Sheet';
import { SheetTitle } from '../SheetTitle';
import { Body } from '../Text';

// Shared by Stats → Progress photos, /photos and /photo/[id] (R181). Phone builds only: on the web the callers draw
// nothing here, so these never touch the file system there.

/** Said on the web, where there are no progress photos. */
export const PHONE_ONLY = 'Progress photos are in the phone app.';

const DENIED = 'Camera access is off. Turn it on in Settings to take a photo.';
const FAILED = "Couldn't save the photo. Try again.";

/** Every progress photo whose file is on this phone, newest first. A row whose file is gone (a restored snapshot) is left out. */
function readProgressPhotos(db: Db): ProgressPhoto[] {
  return listProgressPhotos(db).filter((photo) => progressPhotoExists(photo.fileName));
}

/** The progress photos to show, newest first, read again on focus after a write (R185). */
export function useProgressPhotos(): ProgressPhoto[] {
  return useFocusedDbQuery(readProgressPhotos);
}

/**
 * **Add a photo** (filled, or compact and secondary) and its sheet: **Take photo**, **Choose a photo**, **Cancel**. The
 * camera or the library opens once the sheet has gone. The photo is saved into the app's folder and stored by name;
 * a refused camera or a failed save is said in a muted line under the button.
 */
export function AddProgressPhoto({ compact = false }: { compact?: boolean }) {
  const db = useDb();
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const say = (words: string) => {
    setMessage(words);
    // Said once, on both phones: the line has no live region, which would say it again on Android.
    announce(words);
  };

  const add = async (source: 'camera' | 'library') => {
    let picked;
    try {
      picked = await pickProgressPhoto(source);
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
    try {
      name = saveProgressPhoto(picked.uri, now);
    } catch {
      say(FAILED);
      return;
    }
    try {
      addProgressPhoto(db, name, now);
    } catch {
      deleteProgressPhotoFile(name);
      say(FAILED);
      return;
    }
    bumpData();
  };

  const open = () => {
    flushAll();
    Keyboard.dismiss();
    setMessage(null);
    setChoosing(true);
  };

  const choose = (source: 'camera' | 'library') => {
    setChoosing(false);
    // The camera and the library are screens of their own, which iOS can't show while the sheet is going away.
    afterSheetCloses(() => void add(source));
  };

  return (
    <View style={{ gap: 8 }}>
      {compact ? (
        // 4pt inset keeps the pill's 4pt hit slop inside the section.
        <View style={{ flexDirection: 'row', padding: 4, margin: -4 }}>
          <Button label="Add a photo" size="compact" variant="secondary" onPress={open} />
        </View>
      ) : (
        <Button label="Add a photo" onPress={open} />
      )}
      {message !== null ? <Body muted>{message}</Body> : null}
      <Sheet visible={choosing} onClose={() => setChoosing(false)}>
        <SheetTitle>Add a photo</SheetTitle>
        <View style={{ gap: 8 }}>
          <Button label="Take photo" onPress={() => choose('camera')} />
          <Button label="Choose a photo" variant="secondary" onPress={() => choose('library')} />
          <Button label="Cancel" variant="quiet" onPress={() => setChoosing(false)} />
        </View>
      </Sheet>
    </View>
  );
}
