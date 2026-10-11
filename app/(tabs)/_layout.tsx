import { Tabs } from 'expo-router/js-tabs';
import { Dock } from '../../src/ui/Dock';
import { Header } from '../../src/ui/Header';

/**
 * The shell: header above, dock below, a tab per screen. Settings, Routines, a routine's detail and the routine
 * editor open inside it, so both stay. Back follows the tabs visited, so Close on Settings returns to the tab it was opened from.
 */
export default function TabsLayout() {
  return (
    <Tabs backBehavior="history" screenOptions={{ header: () => <Header /> }} tabBar={(p) => <Dock {...p} />}>
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="routines/index" options={{ href: null }} />
      <Tabs.Screen name="routines/[id]" options={{ href: null }} />
      <Tabs.Screen name="routines/edit/[id]" options={{ href: null }} />
      <Tabs.Screen name="saved/[id]" options={{ href: null }} />
      <Tabs.Screen name="body/[kind]" options={{ href: null }} />
      <Tabs.Screen name="fuel-targets" options={{ href: null }} />
      {/* Phase 6 (R172): a workout and its editor under History; the lifts and the progress photos under Stats. */}
      <Tabs.Screen name="history/[id]" options={{ href: null }} />
      <Tabs.Screen name="history/edit/[id]" options={{ href: null }} />
      <Tabs.Screen name="lifts" options={{ href: null }} />
      <Tabs.Screen name="lift/[id]" options={{ href: null }} />
      <Tabs.Screen name="photos" options={{ href: null }} />
    </Tabs>
  );
}
