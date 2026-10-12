import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { setSetting } from '../../db/repositories/settingsRepo';
import type { MusicAppId } from '../../domain/types';
import type { MusicApp } from '../../platform/music';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { SheetTitle } from '../SheetTitle';

type Props = {
  visible: boolean;
  /** The apps this phone can have (`musicAppsFor(Platform.OS)`). */
  apps: MusicApp[];
  /** The app picked now (Settings `musicApp`), shown selected; null when none is. */
  musicApp: MusicAppId | null;
  onClose: () => void;
};

/**
 * One button per music app, then Close. The app already picked is selected. Picking one stores it (Settings `musicApp`)
 * and closes the sheet; the music bar at the bottom of the session then opens it. Nothing here leaves GymHound (Task 26).
 */
export function MusicSheet({ visible, apps, musicApp, onClose }: Props) {
  const db = useDb();

  const pick = (app: MusicApp) => {
    setSetting(db, 'musicApp', app.id);
    bumpData();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetTitle subtitle="Pick an app. It stays in a bar at the bottom of your workout.">Music</SheetTitle>
      <View style={{ gap: 8 }}>
        {apps.map((app) => (
          <Button
            key={app.id}
            label={app.label}
            variant={app.id === musicApp ? 'primary' : 'secondary'}
            selected={app.id === musicApp}
            onPress={() => pick(app)}
          />
        ))}
      </View>
      <View style={{ marginTop: 8 }}>
        <Button label="Close" variant="quiet" onPress={onClose} />
      </View>
    </Sheet>
  );
}
