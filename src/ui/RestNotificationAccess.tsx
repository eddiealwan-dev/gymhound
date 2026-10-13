import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { AppState, View } from 'react-native';
import { announce } from '../platform/announce';
import { askNotificationAccess, notificationAccess, type NotificationAccess } from '../platform/notificationAccess';
import { Button } from './Button';
import { OpenSettingsButton } from './OpenSettingsButton';
import { Body } from './Text';

export const NOTIFICATIONS_WHY = 'With the phone locked, a notification says when rest is up.';
export const NOTIFICATIONS_OFF = "Notifications are off, so a locked phone won't say when rest is up. Turn them on in Settings.";

/**
 * Settings → Rest timer's line about the lock-screen notification (§18.15, R410). Nothing while it is allowed, or where
 * there is nothing to ask (the web). Before the phone has asked: why it is wanted and **Allow notifications**, which
 * asks (the first rest still asks too, in the session, if this never was tapped). Refused: where to turn it on, with
 * **Open Settings**. It reads again when the app comes back to the front, so a change made in Settings shows at once.
 */
export function RestNotificationAccess(): ReactElement | null {
  const [access, setAccess] = useState<NotificationAccess>('unavailable');
  const mounted = useRef(true);
  /** While the phone's question is up: the app goes inactive and back behind it, and that return must not read over its answer. */
  const asking = useRef(false);

  const show = useCallback((next: NotificationAccess) => {
    if (mounted.current) setAccess(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void notificationAccess().then(show);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !asking.current) void notificationAccess().then(show);
    });
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, [show]);

  const allow = async () => {
    asking.current = true;
    let next: NotificationAccess;
    try {
      next = await askNotificationAccess();
    } finally {
      asking.current = false;
    }
    show(next);
    // The button is gone once this lands, so VoiceOver is told what took its place.
    if (next === 'granted') announce('Notifications are on.');
    else if (next === 'denied') announce(NOTIFICATIONS_OFF);
  };

  if (access === 'undetermined') {
    return (
      <View style={{ gap: 12 }}>
        <Body muted>{NOTIFICATIONS_WHY}</Body>
        {/* 4pt inset keeps the pill's 4pt hit slop inside the group. */}
        <View style={{ alignItems: 'flex-start', padding: 4, margin: -4 }}>
          <Button label="Allow notifications" variant="secondary" size="compact" onPress={() => void allow()} />
        </View>
      </View>
    );
  }
  if (access === 'denied') {
    return (
      <View style={{ gap: 12 }}>
        <Body muted>{NOTIFICATIONS_OFF}</Body>
        <OpenSettingsButton accessibilityLabel="Open Settings to turn on notifications" />
      </View>
    );
  }
  return null;
}
