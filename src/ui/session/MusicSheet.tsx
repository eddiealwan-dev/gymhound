import { useState } from 'react';
import { View } from 'react-native';
import type { MusicApp } from '../../platform/music';
import { openMusicApp } from '../../platform/music';
import { flushAll } from '../../state/draftFlush';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Body, Display } from '../Text';

type Props = {
  visible: boolean;
  /** The apps this phone can have (`musicAppsFor(Platform.OS)`). */
  apps: MusicApp[];
  onClose: () => void;
};

/**
 * One button per music app, then Close. Opening one leaves GymHound, so the sheet closes behind it; an app that is not
 * installed says so here instead. Typed sets are saved before leaving, and again by the flush on the app going to the
 * background (R32).
 */
export function MusicSheet({ visible, apps, onClose }: Props) {
  /** The app that would not open, if the last press failed. */
  const [missing, setMissing] = useState<MusicApp | null>(null);

  const close = () => {
    setMissing(null);
    onClose();
  };

  const open = async (app: MusicApp) => {
    flushAll();
    const result = await openMusicApp(app);
    if (result === 'opened') close();
    else setMissing(app);
  };

  return (
    <Sheet visible={visible} onClose={close}>
      <Display weight={700} style={{ marginBottom: 16 }}>
        Music
      </Display>
      <View style={{ gap: 8 }}>
        {apps.map((app) => (
          <Button key={app.id} label={`Open ${app.label}`} variant="secondary" onPress={() => void open(app)} />
        ))}
      </View>
      {missing !== null ? (
        <Body muted accessibilityLiveRegion="polite" style={{ marginTop: 12 }}>
          {`${missing.label} isn't on this phone.`}
        </Body>
      ) : null}
      <View style={{ marginTop: 8 }}>
        <Button label="Close" variant="quiet" onPress={close} />
      </View>
    </Sheet>
  );
}
