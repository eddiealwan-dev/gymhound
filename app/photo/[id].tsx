import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../src/db/DbProvider';
import { deleteProgressPhoto, type ProgressPhoto } from '../../src/db/repositories/progressPhotosRepo';
import { formatEntryDate, toLocalDate } from '../../src/domain/dates';
import { announce } from '../../src/platform/announce';
import { deviceLocale } from '../../src/platform/locale';
import { deleteProgressPhotoFile, progressPhotoUri } from '../../src/platform/progressPhotoFiles';
import { bumpData } from '../../src/state/dataVersion';
import { Button } from '../../src/ui/Button';
import { afterSheetCloses, ConfirmSheet } from '../../src/ui/Sheet';
import { StepArrow } from '../../src/ui/StepArrow';
import { PHONE_ONLY, useProgressPhotos } from '../../src/ui/stats/progressPhotos';
import { Body } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

const DELETE_FAILED = "Couldn't delete the photo. Try again.";

/** Back where it was opened from; a link opened with no history goes to /photos. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/photos');
}

/**
 * One progress photo, full screen above the tabs with no dock or footer (R181): **Close**, the photo with its date,
 * **‹** (older) and **›** (newer), **Side by side** with the earliest photo, and **Delete photo**, which asks first.
 * Deleting moves to the next older photo (the next newer when it was the earliest) and closes when none is left.
 * Phone builds only; the web says so.
 */
export default function Photo() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 16 }}>
        {/* A quiet button steps back by its padding, so its label lines up with the screen's edge. */}
        <View style={{ alignSelf: 'flex-start', marginLeft: -20 }}>
          <Button label="Close" variant="quiet" onPress={leave} />
        </View>
        {Platform.OS === 'web' ? <Body muted>{PHONE_ONLY}</Body> : <Viewer />}
      </View>
    </View>
  );
}

function Viewer() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id: string }>();
  const photos = useProgressPhotos();
  const [shownId, setShownId] = useState(id);
  const [sideBySide, setSideBySide] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const index = photos.findIndex((photo) => photo.id === shownId);
  if (index < 0) return <Body muted>That photo isn't here.</Body>;

  const shown = photos[index];
  const older = photos[index + 1];
  const newer = photos[index - 1];
  const earliest = photos[photos.length - 1];
  const comparing = sideBySide && earliest.id !== shown.id;
  const today = toLocalDate(Date.now());
  const locale = deviceLocale();
  const dateOf = (photo: ProgressPhoto) => formatEntryDate(photo.localDate, today, locale);

  /** Shows another photo, on its own (Side by side turns off), and says its date: the screen reader stays on ‹ or ›. */
  const go = (photo: ProgressPhoto | undefined) => {
    if (!photo) return;
    setShownId(photo.id);
    setSideBySide(false);
    announce(`Progress photo, ${dateOf(photo)}`);
  };

  const remove = () => {
    setConfirming(false);
    let fileName: string | null;
    try {
      fileName = deleteProgressPhoto(db, shown.id);
    } catch {
      setMessage(DELETE_FAILED);
      announce(DELETE_FAILED);
      return;
    }
    if (fileName !== null) deleteProgressPhotoFile(fileName);
    const next = older ?? newer;
    if (next) {
      setShownId(next.id);
      bumpData();
      return;
    }
    // The screen goes once the question has: iOS can't dismiss it while the sheet is still going away. Until then it
    // keeps the last view; reading again first would flash "That photo isn't here.".
    afterSheetCloses(() => {
      bumpData();
      leave();
    });
  };

  return (
    <View style={{ flex: 1, gap: 16 }}>
      {comparing ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
          <Shown photo={earliest} date={dateOf(earliest)} />
          <Shown photo={shown} date={dateOf(shown)} />
        </View>
      ) : (
        <Shown photo={shown} date={dateOf(shown)} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* The step arrow Fuel's day and History's month use: ‹ goes back in time. */}
        <StepArrow glyph="‹" label="Older photo" disabled={!older} onPress={() => go(older)} />
        <View style={{ flex: 1 }}>
          <Button
            label="Side by side"
            variant="secondary"
            selected={comparing}
            disabled={earliest.id === shown.id}
            onPress={() => setSideBySide((on) => !on)}
          />
        </View>
        <StepArrow glyph="›" label="Newer photo" disabled={!newer} onPress={() => go(newer)} />
      </View>
      {message !== null ? <Body muted>{message}</Body> : null}
      <View style={{ alignSelf: 'center' }}>
        <Button
          label="Delete photo"
          variant="quiet"
          onPress={() => {
            setMessage(null);
            setConfirming(true);
          }}
        />
      </View>
      <ConfirmSheet
        visible={confirming}
        title="Delete this photo?"
        body="It's removed from this phone."
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

/** A photo as large as its space allows, uncropped, with its date under it. */
function Shown({ photo, date }: { photo: ProgressPhoto; date: string }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Image
        source={{ uri: progressPhotoUri(photo.fileName) }}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Progress photo, ${date}`}
        accessibilityIgnoresInvertColors
        style={{ flex: 1, width: '100%' }}
      />
      <Body muted style={{ textAlign: 'center' }}>
        {date}
      </Body>
    </View>
  );
}
