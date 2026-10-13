import { forwardRef } from 'react';
import { Text, View } from 'react-native';
import { streakText, type WeekCardModel } from '../../domain/shareCards';
import { body, cardColors as c, display, fixed, ShareFrame } from './ShareFrame';

const LABEL = { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1, color: c.textMuted } as const;

/** One figure of the week: the number large, its name small under it, in half the card's width. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ width: '50%', paddingRight: 8 }}>
      <Text {...fixed} numberOfLines={1} adjustsFontSizeToFit style={display(800, 28, { color: c.text, fontVariant: ['tabular-nums'] })}>
        {value}
      </Text>
      <Text {...fixed} numberOfLines={1} style={{ ...LABEL, marginTop: 1 }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The weekly summary card shared as an image (§18.17, R449–R452). In the shared dark frame: THIS WEEK and the dates,
 * with the streak beside them, the week as seven day letters with a filled dot for each day trained, then workouts,
 * sets, volume and time two by two, then the week's personal bests (with red PR marks) or, with none, its top three
 * lifts by volume. Everything fits the 450-point card with room to spare.
 */
export const WeekShareCard = forwardRef<View, { model: WeekCardModel; onReady?: () => void }>(function WeekShareCard({ model, onReady }, ref) {
  const list = model.list;
  return (
    <ShareFrame ref={ref} onReady={onReady}>
      <View style={{ flex: 1, marginTop: 16, gap: 14 }}>
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Text {...fixed} style={display(800, 26, { color: c.text, letterSpacing: 0.5 })}>
              {model.kicker}
            </Text>
            {model.streak > 0 ? (
              <Text {...fixed} numberOfLines={1} style={display(700, 15, { color: c.textMuted, letterSpacing: 0.5 })}>
                {streakText(model.streak).toUpperCase()}
              </Text>
            ) : null}
          </View>
          <Text {...fixed} numberOfLines={1} style={body(13)}>
            {model.range}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {model.days.map((d, i) => (
            <View key={i} style={{ alignItems: 'center', gap: 5, width: 34 }}>
              <Text {...fixed} style={display(700, 13, { color: c.textMuted })}>
                {d.letter}
              </Text>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: d.trained ? c.text : c.borderStrong,
                  backgroundColor: d.trained ? c.text : 'transparent',
                }}
              />
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
          <Figure value={`${model.workouts}`} label={model.workouts === 1 ? 'WORKOUT' : 'WORKOUTS'} />
          <Figure value={`${model.sets}`} label="SETS" />
          <Figure value={model.volume} label="VOLUME" />
          <Figure value={model.time} label="TIME" />
        </View>

        {list !== null ? (
          <View style={{ gap: 5 }}>
            <Text {...fixed} style={LABEL}>
              {list.kind === 'prs' ? (list.count === 1 ? '1 PERSONAL RECORD' : `${list.count} PERSONAL RECORDS`) : 'TOP LIFTS'}
            </Text>
            {list.rows.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {list.kind === 'prs' ? (
                  <View style={{ backgroundColor: c.red, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
                    <Text {...fixed} style={display(800, 11, { color: c.text })}>
                      PR
                    </Text>
                  </View>
                ) : null}
                <Text {...fixed} numberOfLines={1} style={body(14, { color: c.text, flex: 1 })}>
                  {row.name}
                </Text>
                <Text {...fixed} numberOfLines={1} style={display(700, 16, { color: c.text, fontVariant: ['tabular-nums'] })}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </ShareFrame>
  );
});
