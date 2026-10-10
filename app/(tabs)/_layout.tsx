import { Tabs } from 'expo-router/js-tabs';
import { Dock } from '../../src/ui/Dock';
import { Header } from '../../src/ui/Header';

/** The shell: header above, dock below, a tab per screen. Settings opens inside it, so both stay. */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ header: () => <Header /> }} tabBar={(p) => <Dock {...p} />}>
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
