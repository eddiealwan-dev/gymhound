import { router } from 'expo-router';
import { Image, Platform, Pressable, View } from 'react-native';
import type { ProgressPhoto } from '../../src/db/repositories/progressPhotosRepo';
import { formatEntryDate, toLocalDate } from '../../src/domain/dates';
import { deviceLocale } from '../../src/platform/locale';
import { progressPhotoUri } from '../../src/platform/progressPhotoFiles';
import { flushAll } from '../../src/state/draftFlush';
import { BackLink } from '../../src/ui/BackLink';
import { EmptyState } from '../../src/ui/EmptyState';
import { Screen } from '../../src/ui/Screen';
import { AddProgressPhoto, PHONE_ONLY, useProgressPhotos } from '../../src/ui/stats/progressPhotos';
import { Body, ScreenTitle } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

/** Back where it was opened from; a link opened with no history goes to /stats. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/stats');
}

/** Under Add a photo while there are none (R401). */
const NO_PHOTOS = 'No photos yet. Each one you add shows here, newest first.';

function openPhoto(id: string) {
  flushAll();
  router.push(`/photo/${id}`);
}

/**
 * Progress photos (R181), a hidden tab route under Stats: where they are kept, **Add a photo**, and a 3-column grid,
 * newest first, each square with its date, opening it full screen. A photo whose file is gone is not shown. Phone
 * builds only; the web says so. No footer (§18.4).
 */
export default function Photos() {
  return (
    <Screen>
      <BackLink label="Stats" onPress={leave} />
      <ScreenTitle>Progress photos</ScreenTitle>
      {Platform.OS === 'web' ? (
        <Body muted style={{ marginTop: 4 }}>
          {PHONE_ONLY}
        </Body>
      ) : (
        <PhotosOnPhone />
      )}
    </Screen>
  );
}

function PhotosOnPhone() {
  const photos = useProgressPhotos();
  const today = toLocalDate(Date.now());
  const locale = deviceLocale();
  return (
    <>
      <Body muted style={{ marginTop: 4, marginBottom: 16 }}>
        They stay on this phone. They aren't in backups.
      </Body>
      <AddProgressPhoto />
      {photos.length === 0 ? <EmptyState style={{ marginTop: 20 }} text={NO_PHOTOS} /> : null}
      {/* Each cell's 4pt padding makes an 8pt gutter; the row steps out by 4 so the squares line up with the edges. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 20 }}>
        {photos.map((photo) => (
          <GridCell key={photo.id} photo={photo} date={formatEntryDate(photo.localDate, today, locale)} label={cellLabel(photo, photos, today, locale)} />
        ))}
      </View>
    </>
  );
}

/**
 * What the screen reader hears for a square: "Photo, Oct 2", with the time added when another photo was taken that day
 * ("Photo, Oct 2, 7:14 AM"), so two squares never sound the same.
 */
function cellLabel(photo: ProgressPhoto, photos: readonly ProgressPhoto[], today: string, locale: string): string {
  const label = `Photo, ${formatEntryDate(photo.localDate, today, locale)}`;
  const shared = photos.some((other) => other.id !== photo.id && other.localDate === photo.localDate);
  if (!shared) return label;
  return `${label}, ${new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(photo.takenAt)}`;
}

function GridCell({ photo, date, label }: { photo: ProgressPhoto; date: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: '33.333%', padding: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => openPhoto(photo.id)}
        style={({ pressed }) => ({ gap: 4, opacity: pressed ? 0.8 : 1 })}
      >
        <Image
          source={{ uri: progressPhotoUri(photo.fileName) }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: colors.surfaceRaised }}
        />
        <Body muted style={{ fontSize: 12 }}>
          {date}
        </Body>
      </Pressable>
    </View>
  );
}
