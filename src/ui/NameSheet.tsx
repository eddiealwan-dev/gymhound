import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Body, Display } from './Text';
import { fonts } from './theme';
import { useTheme } from './ThemeProvider';

type Props = {
  visible: boolean;
  title: string;
  /** What the screen reader calls the field. */
  fieldLabel: string;
  /** The name the field holds each time the sheet opens. */
  initial: string;
  /** Saves the name: null when it saved (the caller closes the sheet), or what stopped it, shown over the buttons. */
  onSave: (name: string) => string | null;
  onCancel: () => void;
};

/**
 * A sheet with one name field and **Save** / **Cancel**: Save as a workout and a saved workout's Rename. What stops a
 * save is said in muted words under the field, never in red.
 */
export function NameSheet({ visible, title, fieldLabel, initial, onSave, onCancel }: Props) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initial);
      setProblem(null);
    }
  }, [visible, initial]);

  const save = () => setProblem(onSave(name));

  return (
    <Sheet visible={visible} onClose={onCancel}>
      <Display weight={700} accessibilityRole="header" style={{ marginBottom: 16 }}>
        {title}
      </Display>
      <TextInput
        value={name}
        onChangeText={(text) => {
          setName(text);
          setProblem(null);
        }}
        onSubmitEditing={save}
        accessibilityLabel={fieldLabel}
        autoCapitalize="sentences"
        returnKeyType="done"
        style={{
          minHeight: 48,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          color: colors.text,
          fontFamily: fonts.body400,
          fontSize: 16,
        }}
      />
      {problem !== null ? (
        <Body muted accessibilityLiveRegion="polite" style={{ marginTop: 8 }}>
          {problem}
        </Body>
      ) : null}
      <View style={{ gap: 8, marginTop: 16 }}>
        <Button label="Save" onPress={save} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </Sheet>
  );
}
