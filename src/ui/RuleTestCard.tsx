import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { ruleTestWeight, type RuleTestScreen } from '../domain/ruleTest';
import { Body, Display, Label } from './Text';
import { useTheme } from './ThemeProvider';

const COLUMNS = ['SET', 'PREVIOUS', 'LB', 'REPS', ''] as const;
const WIDTHS = [36, undefined, 64, 48, 28] as const;

function cell(i: number) {
  const width = WIDTHS[i];
  return width === undefined ? { flex: 1, minWidth: 0 } : { width };
}

/**
 * One still screen of the rule test (R581), drawn like an exercise in a workout: the name with its Something off
 * control, the muted rule line, the set table with every set complete, and under a rule the finish summary's line.
 * Nothing on it can be tapped: it is shown for five seconds.
 */
export function RuleTestCard({ screen }: { screen: RuleTestScreen }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 12 }} accessible accessibilityLabel={`${screen.name}. ${screen.markLabel}. ${screen.ruleLine} ${screen.finish}`}>
      <Label>Today</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
        <Display weight={700} style={{ fontSize: 26, flexShrink: 1 }}>
          {screen.name}
        </Display>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} />
          <Body muted style={{ fontSize: 14 }}>
            {screen.markLabel}
          </Body>
        </View>
      </View>
      <Body muted style={{ fontSize: 14 }}>
        {screen.ruleLine}
      </Body>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {COLUMNS.map((c, i) => (
            <View key={c || 'done'} style={cell(i)}>
              <Body weight={600} muted style={{ fontSize: 10, letterSpacing: 0.3 }}>
                {c}
              </Body>
            </View>
          ))}
        </View>
        {screen.sets.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
            <View style={cell(0)}>
              <Body weight={600}>{i + 1}</Body>
            </View>
            <View style={cell(1)}>
              <Body muted>{s.previous}</Body>
            </View>
            <View style={cell(2)}>
              <Body weight={600}>{ruleTestWeight(s.weight).replace(' lb', '')}</Body>
            </View>
            <View style={cell(3)}>
              <Body weight={600}>{s.reps}</Body>
            </View>
            <View style={cell(4)}>
              <Ionicons name="checkmark-circle" size={22} color={colors.text} />
            </View>
          </View>
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 4 }}>
        <Label>After you finish</Label>
        <Body>{screen.finish}</Body>
      </View>
    </View>
  );
}
