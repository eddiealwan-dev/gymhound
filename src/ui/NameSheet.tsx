import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { MAX_SAVED_NAME } from '../domain/savedWorkout';
import { announce } from '../platform/announce';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { SheetTitle } from './SheetTitle';
import { Body } from './Text';
import { fonts } from './theme';
import { useTheme } from './ThemeProvider';

/** What saving a saved workout's name can be refused for, in words already fit to show. */
const PLAIN_ERRORS = ['Give the workout a name.', `Keep the name to ${MAX_SAVED_NAME} characters.`, 'Nothing logged to save.'];

/** A refused save in plain words: the repository's own copy when it is one of ours, otherwise "Couldn't save. Try again.". */
export function plainSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (PLAIN_ERRORS.includes(message)) return message;
  console.warn('GymHound could not save the name.', error);
  return "Couldn't save. Try again.";
}

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
 * save is said in muted words under the field, never in red, and to the screen reader. Once a save has gone through,
 * Save does nothing more until the sheet opens again, so a double tap saves once.
 */
export function NameSheet({ visible, title, fieldLabel, initial, onSave, onCancel }: Props) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (visible) {
      setName(initial);
      setProblem(null);
      done.current = false;
    }
  }, [visible, initial]);

  const save = () => {
    if (done.current) return;
    const result = onSave(name);
    if (result === null) done.current = true;
    else announce(result);
    setProblem(result);
  };

  return (
    <Sheet visible={visible} onClose={onCancel}>
      <SheetTitle>{title}</SheetTitle>
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
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.bg,
          color: colors.text,
          fontFamily: fonts.body400,
          fontSize: 16,
        }}
      />
      {problem !== null ? (
        <Body muted style={{ marginTop: 8 }}>
          {problem}
        </Body>
      ) : null}
      <View style={{ gap: 8, marginTop: 16 }}>
        <Button label="Save" onPress={save} />
        <Button label="Cancel" variant="quiet" onPress={onCancel} />
      </View>
    </Sheet>
  );
}
