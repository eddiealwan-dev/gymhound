import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { setSetting } from '../../db/repositories/settingsRepo';
import type { MusicApp } from '../../platform/music';
import { bumpData } from '../../state/dataVersion';
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
 * One button per music app, then Close. Picking one stores it (Settings `musicApp`) and closes the sheet; the music bar
 * at the bottom of the session then opens it. Nothing here leaves GymHound (Task 26).
 */
export function MusicSheet({ visible, apps, onClose }: Props) {
  const db = useDb();

  const pick = (app: MusicApp) => {
    setSetting(db, 'musicApp', app.id);
    bumpData();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Display weight={700} style={{ marginBottom: 8 }}>
        Music
      </Display>
      <Body muted style={{ marginBottom: 16 }}>
        Pick an app. It stays in a bar at the bottom of your workout.
      </Body>
      <View style={{ gap: 8 }}>
        {apps.map((app) => (
          <Button key={app.id} label={app.label} variant="secondary" onPress={() => pick(app)} />
        ))}
      </View>
      <View style={{ marginTop: 8 }}>
        <Button label="Close" variant="quiet" onPress={onClose} />
      </View>
    </Sheet>
  );
}
