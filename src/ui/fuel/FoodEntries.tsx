import { useState, type ReactElement } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import type { FoodEntry } from '../../db/repositories/foodLogRepo';
import { type EntryTotals, fuelNumber, servingsText } from '../../domain/fuel';
import { flushAll } from '../../state/draftFlush';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';
import { FoodEntrySheet } from './FoodEntrySheet';

/** How much of what: "1.5 × 1 scoop", or "2 servings" for an entry logged before labels were copied (R158). Null for a quick add. */
function servingsLine(entry: FoodEntry, locale: string): string | null {
  if (entry.foodId === null) return null;
  const n = servingsText(entry.servings, locale);
  if (entry.servingLabel === null) return `${n} ${entry.servings === 1 ? 'serving' : 'servings'}`;
  return `${n} × ${entry.servingLabel}`;
}

/** The muted line under an entry's name: "1.5 × 1 scoop · 180 kcal · 36 g protein" ("600 kcal · 40 g protein" for a quick add). */
export function entryLine(entry: FoodEntry, locale: string): string {
  const macros = `${fuelNumber(entry.kcal, locale)} kcal · ${fuelNumber(entry.proteinG, locale)} g protein`;
  const servings = servingsLine(entry, locale);
  return servings === null ? macros : `${servings} · ${macros}`;
}

/** What VoiceOver says for a row: every number in words, as one. */
function spokenEntry(entry: FoodEntry, locale: string): string {
  const servings = servingsLine(entry, locale);
  return [
    entry.name,
    ...(servings === null ? [] : [servings]),
    `${fuelNumber(entry.kcal, locale)} calories`,
    `${fuelNumber(entry.proteinG, locale)} grams protein`,
    `${fuelNumber(entry.carbsG, locale)} grams carbs`,
    `${fuelNumber(entry.fatG, locale)} grams fat`,
  ].join(', ');
}

/**
 * The day's food (§8.10): each entry's name, servings, calories and protein, with carbs and fat smaller; a tap edits it
 * (`FoodEntrySheet`). A quiet total row follows, summed unrounded and rounded once (R156).
 */
export function FoodEntries({ entries, totals, locale }: { entries: readonly FoodEntry[]; totals: EntryTotals; locale: string }): ReactElement {
  const { colors } = useTheme();
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const open = (entry: FoodEntry) => {
    flushAll();
    Keyboard.dismiss();
    setEditing(entry);
  };

  return (
    <View style={{ gap: 4 }}>
      <Label>Food</Label>
      {entries.length === 0 ? (
        <Body muted style={{ paddingVertical: 8 }}>
          Nothing logged on this day.
        </Body>
      ) : (
        <View>
          {entries.map((entry, i) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={spokenEntry(entry, locale)}
              accessibilityHint="Edits this entry."
              onPress={() => open(entry)}
              style={({ pressed }) => ({
                minHeight: 52,
                paddingVertical: 10,
                gap: 2,
                justifyContent: 'center',
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Body weight={600}>{entry.name}</Body>
              <Body muted>{entryLine(entry, locale)}</Body>
              <Body muted style={{ fontSize: 14 }}>
                {`Carbs ${fuelNumber(entry.carbsG, locale)} g · Fat ${fuelNumber(entry.fatG, locale)} g`}
              </Body>
            </Pressable>
          ))}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 12 }}>
            <Body
              muted
              accessibilityLabel={`Total, ${fuelNumber(totals.kcal, locale)} calories, ${fuelNumber(totals.proteinG, locale)} grams protein, ${fuelNumber(totals.carbsG, locale)} grams carbs, ${fuelNumber(totals.fatG, locale)} grams fat`}
            >
              {`Total · ${fuelNumber(totals.kcal, locale)} kcal · ${fuelNumber(totals.proteinG, locale)} g protein · ${fuelNumber(totals.carbsG, locale)} g carbs · ${fuelNumber(totals.fatG, locale)} g fat`}
            </Body>
          </View>
        </View>
      )}
      <FoodEntrySheet entry={editing} locale={locale} onClose={() => setEditing(null)} />
    </View>
  );
}
