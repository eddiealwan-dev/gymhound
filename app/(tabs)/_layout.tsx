import { Tabs } from 'expo-router/js-tabs';
import { Dock } from '../../src/ui/Dock';
import { Header } from '../../src/ui/Header';

/**
 * The shell: header above, dock below, a tab per screen. Settings, Routines and a routine's detail open inside it, so
 * both stay. Back follows the tabs visited, so Close on Settings returns to the tab it was opened from.
 */
export default function TabsLayout() {
  return (
    <Tabs backBehavior="history" screenOptions={{ header: () => <Header /> }} tabBar={(p) => <Dock {...p} />}>
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="routines/index" options={{ href: null }} />
      <Tabs.Screen name="routines/[id]" options={{ href: null }} />
    </Tabs>
  );
}
