import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from './ThemeProvider';

/**
 * Cuts a day's exercises into runs: each superset is one run, every other exercise a run of its own. `links[i]` says
 * whether item i forms a superset with the item after it.
 */
export function supersetRuns<T>(items: T[], links: boolean[]): { members: T[]; superset: boolean }[] {
  const runs: { members: T[]; superset: boolean }[] = [];
  items.forEach((item, i) => {
    if (i > 0 && links[i - 1]) {
      const run = runs[runs.length - 1];
      run.members.push(item);
      run.superset = true;
    } else {
      runs.push({ members: [item], superset: false });
    }
  });
  return runs;
}

/**
 * The superset mark: a 3px bar in the text colour down the left edge of its members (DESIGN.md). It sits in the card's
 * padding, so the members' text stays in line with the exercises around them.
 */
export function SupersetBar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ borderLeftWidth: 3, borderLeftColor: colors.text, marginLeft: -12, paddingLeft: 9 }}>{children}</View>;
}
