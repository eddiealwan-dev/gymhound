import type { ReactElement } from 'react';
import { TextInput, useWindowDimensions, View } from 'react-native';
import type { MacroInput } from '../../domain/fuel';
import { Body } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

/**
 * A labelled text field as the Fuel forms draw them: the label 8pt over the field, and under it, muted, what needs
 * another look. Never red: a field that needs a look gets a heavier muted underline. No live region: the form says its
 * problems with `announce()` when its button is pressed, and a live region would say them twice on Android.
 */
export function FuelField({
  label,
  value,
  onChangeText,
  error,
  numeric = false,
  placeholder,
  autoFocus,
  onSubmit,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  numeric?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Body>{label}</Body>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoFocus={autoFocus}
        // iOS adds its own Done bar above the number pad with this key (R43).
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        returnKeyType="done"
        autoCapitalize={numeric ? 'none' : 'sentences'}
        style={{
          minHeight: 48,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          ...(error ? { borderBottomWidth: 2, borderBottomColor: colors.textMuted } : null),
          backgroundColor: colors.surface,
          color: colors.text,
          fontFamily: fonts.body400,
          fontSize: 16,
        }}
      />
      {error ? <Body muted>{error}</Body> : null}
    </View>
  );
}

const KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;

/**
 * Calories, protein, carbs and fat as four number fields (a comma or a dot), each with its problem under it. They sit
 * two to a row, one a row on a narrow screen or at large text sizes. Shared by quick add, your own foods and the targets (Task 10),
 * which passes `carbsLabel` and `fatLabel` to call those two optional.
 */
export function MacroFields({
  value,
  onChange,
  errors,
  kcalLabel,
  carbsLabel = 'Carbs (g)',
  fatLabel = 'Fat (g)',
}: {
  value: MacroInput;
  onChange: (v: MacroInput) => void;
  errors: Partial<Record<keyof MacroInput, string>>;
  kcalLabel: string;
  carbsLabel?: string;
  fatLabel?: string;
}): ReactElement {
  const labels: Record<keyof MacroInput, string> = { kcal: kcalLabel, protein: 'Protein (g)', carbs: carbsLabel, fat: fatLabel };
  // At large text sizes two fields a row would squeeze their labels, so each takes the row.
  const { fontScale } = useWindowDimensions();
  const basis = fontScale > 1.3 ? '100%' : 140;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      {KEYS.map((key) => (
        <View key={key} style={{ flexGrow: 1, flexBasis: basis, minWidth: 0 }}>
          <FuelField
            label={labels[key]}
            value={value[key]}
            numeric
            error={errors[key]}
            onChangeText={(text) => onChange({ ...value, [key]: text })}
          />
        </View>
      ))}
    </View>
  );
}
