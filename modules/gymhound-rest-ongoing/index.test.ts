/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';

import { REST_ONGOING_MODULE, type RestOngoingModule } from './index';

const root = __dirname;
const kotlinDir = join(root, 'android/src/main/java/expo/modules/gymhoundrestongoing');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('gymhound-rest-ongoing', () => {
  it('exports the native module name the Kotlin module registers', () => {
    expect(REST_ONGOING_MODULE).toBe('GymHoundRestOngoing');
    const kotlin = readFileSync(join(kotlinDir, 'GymHoundRestOngoingModule.kt'), 'utf8');
    expect(kotlin).toContain(`Name("${REST_ONGOING_MODULE}")`);
  });

  it('declares show(endsAt, title, text) and hide() on both sides', async () => {
    const calls: unknown[][] = [];
    const fake: RestOngoingModule = {
      show: async (endsAt, title, text) => {
        calls.push(['show', endsAt, title, text]);
      },
      hide: async () => {
        calls.push(['hide']);
      },
    };
    await fake.show(1_700_000_090_000, 'Rest', 'Bench press');
    await fake.hide();
    expect(calls).toEqual([['show', 1_700_000_090_000, 'Rest', 'Bench press'], ['hide']]);

    const kotlin = readFileSync(join(kotlinDir, 'GymHoundRestOngoingModule.kt'), 'utf8');
    expect(kotlin).toMatch(/AsyncFunction\("show"\) \{ endsAt: Double, title: String, text: String ->/);
    expect(kotlin).toMatch(/AsyncFunction<Unit>\("hide"\)/);
  });

  it('is an Android-only module whose class autolinking can find', () => {
    const config = JSON.parse(read('expo-module.config.json'));
    expect(config.platforms).toEqual(['android']);
    expect(config.android.modules).toEqual(['expo.modules.gymhoundrestongoing.GymHoundRestOngoingModule']);
    const kotlin = readFileSync(join(kotlinDir, 'GymHoundRestOngoingModule.kt'), 'utf8');
    expect(kotlin).toMatch(/^package expo\.modules\.gymhoundrestongoing$/m);
    expect(kotlin).toMatch(/class GymHoundRestOngoingModule : Module\(\)/);
    expect(read('android/build.gradle')).toContain('namespace "expo.modules.gymhoundrestongoing"');
  });

  it('keeps the notification as R202 specifies', () => {
    const kotlin = readFileSync(join(kotlinDir, 'RestOngoingNotification.kt'), 'utf8');
    expect(kotlin).toContain('CHANNEL_ID = "rest-ongoing"');
    expect(kotlin).toContain('CHANNEL_NAME = "Rest timer countdown"');
    expect(kotlin).toContain('NOTIFICATION_ID = 4711');
    for (const call of [
      'NotificationManager.IMPORTANCE_LOW',
      'setSound(null, null)',
      'enableVibration(false)',
      '.setOngoing(true)',
      '.setOnlyAlertOnce(true)',
      '.setSilent(true)',
      '.setUsesChronometer(true)',
      '.setChronometerCountDown(true)',
      '.setWhen(endsAt)',
      '.setShowWhen(true)',
      '.setTimeoutAfter(remaining)',
      'NotificationCompat.CATEGORY_STOPWATCH',
      'PendingIntent.FLAG_IMMUTABLE',
      'Manifest.permission.POST_NOTIFICATIONS',
      'cancel(NOTIFICATION_ID)',
    ]) {
      expect(kotlin).toContain(call);
    }
  });
});
