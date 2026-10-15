import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { siteOf, sourcesFor } from '../../domain/programCard';
import { announce } from '../../platform/announce';
import { PROGRAM_SOURCES } from '../../seed/programs.generated';
import type { Program, ProgramSource } from '../../seed/programTypes';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { SheetTitle } from '../SheetTitle';
import { Body, Num } from '../Text';
import { useTheme } from '../ThemeProvider';

/** What a link that would not open says, under its source (R631). */
const FAILED = "Couldn't open the link.";

/**
 * One source: its number in Barlow with tabular figures, so a column of them lines up; the citation; and under it the
 * site, a quiet 44pt link that opens the address in the phone's browser. The number hangs in its own column so the
 * citation's lines start together.
 */
function SourceRow({ source, failed, onOpen }: { source: ProgramSource; failed: boolean; onOpen: () => void }) {
  const { colors } = useTheme();
  const site = siteOf(source.url);
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Num weight={600} accessibilityLabel={`Source ${source.id}`} style={{ fontSize: 18, lineHeight: 22, minWidth: 36 }}>
        {`[${source.id}]`}
      </Num>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body>{source.citation}</Body>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${site}`}
          accessibilityHint="Opens in your browser"
          onPress={onOpen}
          style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, opacity: pressed ? 0.8 : 1 })}
        >
          <Body muted style={{ textDecorationLine: 'underline', flexShrink: 1 }}>
            {site}
          </Body>
          <Ionicons name="open-outline" size={14} color={colors.textMuted} />
        </Pressable>
        {failed ? (
          <Body muted accessibilityLiveRegion="polite">
            {FAILED}
          </Body>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A program's sources (R631): titled "Sources" over the program's name, each of its `source_ids` in number order with
 * its citation and a link to its site. Opening one sends nothing but the visit the lifter chose. A link that won't
 * open says so under its source, and the screen reader hears it.
 */
export function SourcesSheet({ program, visible, onClose }: { program: Program; visible: boolean; onClose: () => void }) {
  const [failed, setFailed] = useState<number | null>(null);
  const sources = sourcesFor(program, PROGRAM_SOURCES);

  const open = (source: ProgramSource) => {
    setFailed(null);
    let opening: Promise<unknown>;
    try {
      opening = Linking.openURL(source.url);
    } catch (error) {
      opening = Promise.reject(error);
    }
    opening.catch((error: unknown) => {
      console.warn('GymHound could not open the link.', error);
      setFailed(source.id);
      announce(FAILED);
    });
  };

  const close = () => {
    setFailed(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close}>
      <SheetTitle subtitle={program.name}>Sources</SheetTitle>
      <View style={{ gap: 12 }}>
        {sources.map((source) => (
          <SourceRow key={source.id} source={source} failed={failed === source.id} onOpen={() => open(source)} />
        ))}
      </View>
      <View style={{ marginTop: 16 }}>
        <Button label="Close" variant="quiet" onPress={close} />
      </View>
    </Sheet>
  );
}
