import { type ReactElement, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { setSetting } from '../../db/repositories/settingsRepo';
import { toLocalDate } from '../../domain/dates';
import { moveWidget, WEEKLY_GOALS, widgetInfo, WIDGETS, type WidgetId } from '../../domain/profile';
import { useIsPro } from '../../platform/entitlements';
import { deviceLocale } from '../../platform/locale';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { SheetTitle } from '../SheetTitle';
import { Body, Display, Label } from '../Text';
import { useTheme } from '../ThemeProvider';
import { BodyWeightWidget, DailyMacrosWidget, WorkoutsPerWeekWidget } from './widgets';

/** A row of the + Widget sheet: the widget's title, what it shows, and "Pro" for a free lifter where it is Pro's. */
function WidgetChoice({ id, locked, onPress }: { id: WidgetId; locked: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const info = widgetInfo(id);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${info.title}${locked ? ', part of Pro' : ''}. ${info.about}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        gap: 4,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
        <Body weight={600}>{info.title}</Body>
        {locked ? (
          <Body weight={600} style={{ fontSize: 12, color: colors.textMuted, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 }}>
            Pro
          </Body>
        ) : null}
      </View>
      <Body muted style={{ fontSize: 14 }}>{`${info.group} · ${info.about}`}</Body>
    </Pressable>
  );
}

/**
 * The Profile's dashboard (R567): its widgets in the lifter's order, **+ Widget** while any is left to add, and each
 * widget's ⋯ with Move up, Move down and Remove, and for Workouts per week its weekly goal. Free lifters can add Daily
 * macros too: it shows what Pro would, with See Pro.
 */
export function Dashboard({ widgets, weeklyGoal }: { widgets: readonly WidgetId[]; weeklyGoal: number | null }): ReactElement {
  const db = useDb();
  const pro = useIsPro();
  const [adding, setAdding] = useState(false);
  const [optionsFor, setOptionsFor] = useState<WidgetId | null>(null);
  const locale = deviceLocale();
  const today = toLocalDate(Date.now());
  const left = WIDGETS.filter((w) => !widgets.includes(w.id));

  const save = (list: readonly WidgetId[]) => {
    setSetting(db, 'profileWidgets', [...list]);
    bumpData();
  };
  const setGoal = (goal: number | null) => {
    setSetting(db, 'weeklyWorkoutGoal', goal);
    bumpData();
  };
  // The sheet keeps showing its widget while it fades out.
  const lastOptions = useRef<WidgetId | null>(null);
  if (optionsFor !== null) lastOptions.current = optionsFor;
  const shown = optionsFor ?? lastOptions.current;
  const at = shown === null ? -1 : widgets.indexOf(shown);
  const close = () => setOptionsFor(null);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Display weight={700} accessibilityRole="header" style={{ fontSize: 26 }}>
          Dashboard
        </Display>
        {left.length > 0 ? (
          <View style={{ padding: 4, margin: -4 }}>
            <Button label="+ Widget" accessibilityLabel="Add a widget" variant="secondary" size="compact" onPress={() => setAdding(true)} />
          </View>
        ) : null}
      </View>
      {widgets.length === 0 ? <Body muted>No widgets. + Widget adds one.</Body> : null}
      {widgets.map((id) => {
        const onOptions = () => setOptionsFor(id);
        if (id === 'workouts_per_week') return <WorkoutsPerWeekWidget key={id} today={today} goal={weeklyGoal} locale={locale} onOptions={onOptions} />;
        if (id === 'daily_macros') return <DailyMacrosWidget key={id} today={today} locale={locale} onOptions={onOptions} />;
        return <BodyWeightWidget key={id} today={today} locale={locale} onOptions={onOptions} />;
      })}

      <Sheet visible={adding} onClose={() => setAdding(false)}>
        <SheetTitle>Add a widget</SheetTitle>
        <View style={{ gap: 8 }}>
          {left.map((w) => (
            <WidgetChoice
              key={w.id}
              id={w.id}
              locked={w.pro && !pro}
              onPress={() => {
                save([...widgets, w.id]);
                setAdding(false);
              }}
            />
          ))}
          <Button label="Cancel" variant="quiet" onPress={() => setAdding(false)} />
        </View>
      </Sheet>

      <Sheet visible={optionsFor !== null} onClose={close}>
        {shown !== null ? (
          <>
            <SheetTitle>{widgetInfo(shown).title}</SheetTitle>
            {shown === 'workouts_per_week' ? (
              <View style={{ gap: 8, marginBottom: 24 }}>
                <Label>Weekly goal</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Button label="None" accessibilityLabel="No weekly goal" size="compact" variant={weeklyGoal === null ? 'primary' : 'secondary'} selected={weeklyGoal === null} onPress={() => setGoal(null)} />
                  {WEEKLY_GOALS.map((n) => (
                    <Button
                      key={n}
                      label={String(n)}
                      accessibilityLabel={`${n} ${n === 1 ? 'workout' : 'workouts'} a week`}
                      size="compact"
                      variant={weeklyGoal === n ? 'primary' : 'secondary'}
                      selected={weeklyGoal === n}
                      onPress={() => setGoal(n)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <Button
                label="Move up"
                variant="secondary"
                disabled={at <= 0}
                onPress={() => {
                  save(moveWidget(widgets, shown, -1));
                  close();
                }}
              />
              <Button
                label="Move down"
                variant="secondary"
                disabled={at < 0 || at >= widgets.length - 1}
                onPress={() => {
                  save(moveWidget(widgets, shown, 1));
                  close();
                }}
              />
              <Button
                label="Remove from dashboard"
                variant="secondary"
                onPress={() => {
                  save(widgets.filter((id) => id !== shown));
                  close();
                }}
              />
              <Button label="Done" variant="quiet" onPress={close} />
            </View>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
