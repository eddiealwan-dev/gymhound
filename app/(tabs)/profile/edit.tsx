import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput, View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { eraseAllData } from '../../../src/db/repositories/eraseRepo';
import { getSettings, setSetting } from '../../../src/db/repositories/settingsRepo';
import type { Db } from '../../../src/db/types';
import { GOAL_MAX, NAME_MAX, tidyProfileText } from '../../../src/domain/profile';
import { announce } from '../../../src/platform/announce';
import { eraseFiles } from '../../../src/platform/eraseFiles';
import { deleteProfilePhotoFile, pickProfilePhoto, saveProfilePhoto } from '../../../src/platform/profilePhotoFile';
import { getRestTimerSurface } from '../../../src/platform/restTimer';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { flushAll } from '../../../src/state/draftFlush';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { OpenSettingsButton } from '../../../src/ui/OpenSettingsButton';
import { Avatar, useProfile } from '../../../src/ui/profile/Avatar';
import { Screen } from '../../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../../../src/ui/Sheet';
import { SheetTitle } from '../../../src/ui/SheetTitle';
import { Body, Label, ScreenTitle } from '../../../src/ui/Text';
import { fonts } from '../../../src/ui/theme';
import { useTheme } from '../../../src/ui/ThemeProvider';
import { getCloudFolder } from '../../../src/platform/cloud/iCloudFolder';
import { getHealthStore } from '../../../src/platform/health';

const PHOTO_DENIED = 'Camera access is off. Turn it on in Settings to take a photo.';
const PHOTO_FAILED = "Couldn't save the photo. Try again.";
/** Said on the web, where the photo can't be kept. */
export const PHOTO_PHONE_ONLY = 'Your profile photo is set in the phone app.';

/** Said under Account (R566): GymHound keeps everything on the phone, so there is nothing to sign in to. */
export const NO_ACCOUNT =
  "GymHound doesn't use an account. What you log stays on this phone, so there's no username, email or password to remember or reset, and no sign-in with Apple, Google or Facebook.";
export const MOVING_PHONES = 'Moving to a new phone? Backups in Settings bring everything with you, and GymHound Pro comes back with Restore purchases on the same Apple ID.';

/**
 * What Delete all data deletes (R566). The iCloud copy and Apple Health are named only where this build has them, so a
 * store build without them (R591) never mentions them.
 */
export function eraseBody({ cloud, health }: { cloud: boolean; health: boolean }): string {
  const backups = cloud ? "GymHound's backups on the phone and in iCloud" : "GymHound's backups on the phone";
  const kept = health ? ' Workouts already in Apple Health stay there.' : '';
  return `Every workout, routine and saved workout of your own, exercise of your own, body entry, photo, food and water entry, your profile and your settings are deleted from this phone, with ${backups}. This can't be undone.${kept} Pro stays with your Apple ID.`;
}
const ERASE_FAILED = "Couldn't delete your data. Nothing was deleted.";

function backToProfile() {
  if (router.canGoBack()) router.back();
  else router.replace('/profile');
}

/** A heading and what is under it, as Settings' groups are: 8pt under the heading, 16pt between items. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{title}</Label>
      <View style={{ gap: 16 }}>{children}</View>
    </View>
  );
}

/**
 * A text field kept as it is typed (R566): written on every change, tidied (spaces, length) when the field is left,
 * and once more as the screen goes, so nothing typed is lost to a quick Back.
 */
function ProfileText({
  label,
  hint,
  field,
  max,
  multiline = false,
}: {
  label: string;
  hint: string;
  field: 'profileName' | 'profileGoal';
  max: number;
  multiline?: boolean;
}) {
  const db = useDb();
  const { colors } = useTheme();
  const stored = useDbQuery(useCallback((d: Db) => getSettings(d)[field], [field]));
  const [draft, setDraft] = useState(stored);
  const latest = useRef(draft);
  latest.current = draft;
  // Typed and not yet settled. Only then does leaving the page write the field: a tab's page stays mounted, so after
  // Delete all data an untouched field must not write the old name back.
  const dirty = useRef(false);

  // The stored value moved on without this field (Delete all data): the field follows, unless it holds typing.
  useEffect(() => {
    if (!dirty.current) setDraft(stored);
  }, [stored]);

  const settle = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const tidy = tidyProfileText(latest.current, max);
    if (tidy !== latest.current) setDraft(tidy);
    setSetting(db, field, tidy);
    bumpData();
  };
  // Leaving the screen with the field still open settles it too.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- settle reads the latest draft through its refs
  useEffect(() => () => settle(), []);

  return (
    <View style={{ gap: 8 }}>
      <Body weight={600}>{label}</Body>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          dirty.current = true;
          setDraft(text);
          setSetting(db, field, text);
        }}
        onBlur={settle}
        onSubmitEditing={() => Keyboard.dismiss()}
        maxLength={max}
        multiline={multiline}
        submitBehavior={multiline ? 'blurAndSubmit' : undefined}
        returnKeyType="done"
        autoCapitalize={field === 'profileName' ? 'words' : 'sentences'}
        autoComplete={field === 'profileName' ? 'name' : 'off'}
        textContentType={field === 'profileName' ? 'name' : 'none'}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholder={hint}
        placeholderTextColor={colors.textMuted}
        style={{
          minHeight: 48,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 12 : 0,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
          color: colors.text,
          fontFamily: fonts.body400,
          fontSize: 16,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

/** The photo, **Change** (Take photo / Choose a photo) and **Remove** (R566). On the web it says the phone app sets it. */
function PhotoControl() {
  const db = useDb();
  const profile = useProfile();
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const web = Platform.OS === 'web';

  const say = (words: string) => {
    setMessage(words);
    announce(words);
  };

  const change = async (source: 'camera' | 'library') => {
    let picked;
    try {
      picked = await pickProfilePhoto(source);
    } catch (error) {
      console.warn('GymHound could not save the profile photo.', error);
      say(PHOTO_FAILED);
      return;
    }
    if (picked.status === 'denied') return say(PHOTO_DENIED);
    if (picked.status === 'cancelled') return;
    const before = getSettings(db).profilePhoto;
    let name: string;
    try {
      name = saveProfilePhoto(picked.uri, Date.now());
      setSetting(db, 'profilePhoto', name);
    } catch (error) {
      console.warn('GymHound could not save the profile photo.', error);
      say(PHOTO_FAILED);
      return;
    }
    if (before !== null && before !== name) deleteProfilePhotoFile(before);
    bumpData();
    announce('Photo changed.');
  };

  const remove = () => {
    const before = getSettings(db).profilePhoto;
    setSetting(db, 'profilePhoto', null);
    if (before !== null) deleteProfilePhotoFile(before);
    bumpData();
    announce('Photo removed.');
  };

  const choose = (source: 'camera' | 'library') => {
    setChoosing(false);
    // The camera and the library are screens of their own, which iOS can't show while the sheet is going away.
    afterSheetCloses(() => void change(source));
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
        <Avatar size={96} photo={profile.photo} name={profile.name} />
        {web ? null : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 4, margin: -4 }}>
            <Button
              label="Change"
              accessibilityLabel={profile.photo === null ? 'Add a profile photo' : 'Change the profile photo'}
              variant="secondary"
              size="compact"
              onPress={() => {
                flushAll();
                Keyboard.dismiss();
                setMessage(null);
                setChoosing(true);
              }}
            />
            {profile.photo !== null ? <Button label="Remove" accessibilityLabel="Remove the profile photo" variant="quiet" size="compact" onPress={remove} /> : null}
          </View>
        )}
      </View>
      {web ? <Body muted>{PHOTO_PHONE_ONLY}</Body> : null}
      {message !== null ? <Body muted>{message}</Body> : null}
      {message === PHOTO_DENIED ? <OpenSettingsButton accessibilityLabel="Open Settings to turn on the camera" /> : null}
      <Sheet visible={choosing} onClose={() => setChoosing(false)}>
        <SheetTitle>Profile photo</SheetTitle>
        <View style={{ gap: 8 }}>
          <Button label="Take photo" onPress={() => choose('camera')} />
          <Button label="Choose a photo" variant="secondary" onPress={() => choose('library')} />
          <Button label="Cancel" variant="quiet" onPress={() => setChoosing(false)} />
        </View>
      </Sheet>
    </View>
  );
}

/**
 * Danger zone (R568): **Delete all data**, behind a question whose safe answer, Cancel, comes first. Yes empties the
 * database to a fresh install's, deletes the photos and GymHound's backups, and lands on Train.
 */
function DangerZone() {
  const db = useDb();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);

  const erase = () => {
    setAsking(false);
    flushAll();
    try {
      eraseAllData(db, getLocales()[0]?.measurementSystem ?? null, Date.now());
    } catch (error) {
      console.warn('GymHound could not delete the data.', error);
      setFailed(true);
      announce(ERASE_FAILED);
      return;
    }
    getRestTimerSurface()
      .cancel()
      .catch(() => {});
    void eraseFiles();
    bumpData();
    announce('Everything is deleted. GymHound is starting fresh.');
    router.replace('/');
  };

  return (
    <Group title="Danger zone">
      <Body muted>Deletes everything GymHound keeps on this phone and starts it fresh, as on the day you installed it.</Body>
      <View style={{ flexDirection: 'row', padding: 4, margin: -4 }}>
        <Button label="Delete all data" variant="secondary" onPress={() => setAsking(true)} />
      </View>
      {failed ? <Body muted>{ERASE_FAILED}</Body> : null}
      <ConfirmSheet
        visible={asking}
        title="Delete all data?"
        body={eraseBody({ cloud: getCloudFolder() !== null, health: getHealthStore() !== null })}
        confirmLabel="Delete everything"
        cancelLabel="Cancel"
        primary="cancel"
        onConfirm={erase}
        onCancel={() => setAsking(false)}
      />
    </Group>
  );
}

/** Edit profile (R566, R568): photo, name, goal, what Account means here, and the danger zone. */
export default function EditProfile() {
  return (
    <Screen footer>
      <BackLink label="Profile" onPress={backToProfile} />
      <ScreenTitle>Edit profile</ScreenTitle>
      <View style={{ gap: 32, marginTop: 24 }}>
        <PhotoControl />
        <View style={{ gap: 16 }}>
          <ProfileText label="Name (optional)" hint="What to call you" field="profileName" max={NAME_MAX} />
          <ProfileText label="Goal (optional)" hint="What you're training for" field="profileGoal" max={GOAL_MAX} multiline />
        </View>
        <Group title="Account">
          <Body>{NO_ACCOUNT}</Body>
          <Body muted>{MOVING_PHONES}</Body>
        </Group>
        <DangerZone />
      </View>
    </Screen>
  );
}
