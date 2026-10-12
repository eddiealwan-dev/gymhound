import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { calendarDayTitle } from '../../domain/dates';
import { deviceLocale } from '../../platform/locale';
import { progressPhotoUri } from '../../platform/progressPhotoFiles';
import { flushAll } from '../../state/draftFlush';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';
import { AddProgressPhoto, useProgressPhotos } from './progressPhotos';

function openPhotos() {
  flushAll();
  router.push('/photos');
}

/**
 * Stats → Progress photos (R181), the last section. With photos: the newest as a 64 × 64 thumbnail and
 * "{n} photos · latest {day}", opening /photos. With none: why to take one, and a compact **Add a photo**. A photo whose
 * file is gone is not shown or counted. Phone builds only: nothing on the web.
 */
export function PhotosRow({ today }: { today: string }): ReactElement | null {
  if (Platform.OS === 'web') return null;
  return <PhotosRowOnPhone today={today} />;
}

function PhotosRowOnPhone({ today }: { today: string }) {
  const { colors } = useTheme();
  const photos = useProgressPhotos();
  const newest = photos[0];

  return (
    <View>
      <Label style={{ marginBottom: 8 }}>Progress photos</Label>
      {newest ? (
        <PhotosLink count={photos.length} fileName={newest.fileName} latest={calendarDayTitle(newest.localDate, today, deviceLocale())} colors={colors} />
      ) : (
        <View style={{ gap: 12 }}>
          <Body muted>A photo now and then shows change a scale can't.</Body>
          <AddProgressPhoto compact />
        </View>
      )}
    </View>
  );
}

function PhotosLink({
  count,
  fileName,
  latest,
  colors,
}: {
  count: number;
  fileName: string;
  latest: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const counted = `${count} ${count === 1 ? 'photo' : 'photos'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Progress photos, ${counted}, latest ${latest}`}
      onPress={openPhotos}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.8 : 1 })}
    >
      <Image
        source={{ uri: progressPhotoUri(fileName) }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: colors.surfaceRaised }}
      />
      <Body muted style={{ flex: 1, minWidth: 0 }}>
        {`${counted} · latest ${latest}`}
      </Body>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}
