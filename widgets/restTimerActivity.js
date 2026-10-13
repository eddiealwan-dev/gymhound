// PHASE 7 (iOS build only): the rest timer's Live Activity, on the lock screen and in the Dynamic Island (R301).
//
// expo-widgets turns the function marked 'widget' into a string that its widget extension renders with SwiftUI
// (Expo UI components), so the countdown keeps running on the lock screen while the app is asleep. The app starts,
// moves and ends it through src/platform/restTimer/liveActivity.ts. This file is required only inside that guard
// (src/platform/native/optional.ts): Expo Go never runs it, and before `expo-widgets` is installed Metro bundles a stub
// for both imports below (metro.config.js).
//
// Not yet built or seen on a phone: the first development build checks it (plan Task 7.3). It is plain JavaScript,
// outside the TypeScript project, because its two packages are not installed until phase 7.
//
// Props are JSON (epoch ms): { startedAt, endsAt }. `startedAt` is when the rest began, so a moved end (−15s, +15s)
// keeps the length the rest started with, as the in-app track does (§18.6). Once `endsAt` passes, the activity is
// stale (its staleDate is the end) and reads "Rest's up." until the app ends it.
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

const RestTimerActivity = (props, environment) => {
  'widget';
  const range = { lower: new Date(props.startedAt), upper: new Date(props.endsAt) };
  const over = environment.isStale === true;
  const countdown = (size) => (
    <Text timerInterval={range} countsDown={true} modifiers={[font({ size, weight: 'bold' }), monospacedDigit()]} />
  );
  const title = <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{over ? "Rest's up." : 'Rest'}</Text>;

  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 })]}>
        <VStack alignment="leading">
          {title}
          <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>GymHound</Text>
        </VStack>
        <Spacer />
        {over ? null : countdown(40)}
      </HStack>
    ),
    compactLeading: <Text modifiers={[font({ size: 13, weight: 'semibold' })]}>Rest</Text>,
    compactTrailing: over ? <Text>0:00</Text> : countdown(13),
    minimal: over ? <Text>0:00</Text> : countdown(12),
    expandedLeading: title,
    expandedTrailing: over ? null : countdown(28),
    expandedBottom: <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>GymHound</Text>,
  };
};

export default createLiveActivity('RestTimer', RestTimerActivity);
