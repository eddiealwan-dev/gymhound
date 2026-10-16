import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cardText, cardWhy, citationParts, citationSpeech, detailRows, progressionParagraphs, summaryLine, titleOf } from '../../domain/programCard';
import type { Program } from '../../seed/programTypes';
import { breakableName } from '../largeText';
import { Body, Label, ScreenTitle } from '../Text';
import { useTheme } from '../ThemeProvider';
import { ProgramPicture } from './ProgramPicture';
import { SourcesSheet } from './SourcesSheet';

/**
 * Text from the documents, with its citation markers ("[15][16]") kept in place but muted, so the sentence reads first.
 * VoiceOver hears the markers as "source 15, source 16".
 */
function Cited({ text, lead, style }: { text: string; lead?: string; style?: { flex?: number } }) {
  const { colors } = useTheme();
  return (
    <Body accessibilityLabel={citationSpeech(lead === undefined ? text : `${lead}${text}`)} style={style}>
      {lead === undefined ? null : <Body weight={600}>{lead}</Body>}
      {citationParts(text).map((part, i) =>
        part.cite ? (
          <Text key={i} style={{ color: colors.textMuted }}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Body>
  );
}

/** A section of the card: its Label heading (a VoiceOver heading, shown in upper case) 8pt over what it holds. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 32 }}>
      <Label style={{ marginBottom: 8 }}>{title}</Label>
      {children}
    </View>
  );
}

/** One bullet of Why it works: a muted dot in its own column, so wrapped lines start under the words, not the dot. */
function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Body muted accessible={false} importantForAccessibility="no" accessibilityElementsHidden>
        •
      </Body>
      <Cited text={text} style={{ flex: 1 }} />
    </View>
  );
}

/**
 * A program's card (R630): its page on Routines, the documents' description in GymHound's design. Top to bottom: the
 * picture as a full-width banner with the title under it; the summary band; the details as
 * label and value (a Pro program on free says so under the band); Why it works, How it progresses (in short labelled
 * paragraphs) and After this program (`cardText`, ruling R-w3); a quiet Sources link to the Sources sheet
 * (R631); then `footer`, the program's state and actions. Never its days or exercises: those show only once it is the
 * lifter's active program (R634), which the footer decides.
 */
export function ProgramCard({ program, footer, locked = false }: { program: Program; footer: ReactNode; locked?: boolean }) {
  const { colors } = useTheme();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const count = program.sourceIds.length;
  return (
    <View>
      <View style={{ gap: 16 }}>
        <ProgramPicture programId={program.id} label={program.picture.label} kind="card" />
        <ScreenTitle accessibilityLabel={program.name} style={{ minWidth: 0 }}>
          {breakableName(titleOf(program))}
        </ScreenTitle>
      </View>

      <View style={{ marginTop: 16, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12 }}>
        <Body weight={600}>{summaryLine(program)}</Body>
      </View>
      {/* A Pro program on free says so where a reader who stops at the band sees it (design gate #22). */}
      {locked ? (
        <Body muted style={{ marginTop: 8 }}>
          Part of GymHound Pro.
        </Body>
      ) : null}

      <View style={{ marginTop: 16, gap: 12 }}>
        {detailRows(program).map((row) => (
          <Cited key={row.label} lead={`${row.label}: `} text={row.value} />
        ))}
      </View>

      <Section title="Why it works">
        <View style={{ gap: 8 }}>
          {cardWhy(program).map((bullet) => (
            <Bullet key={bullet} text={bullet} />
          ))}
        </View>
      </Section>
      <Section title="How it progresses">
        {/* One short paragraph per labelled part of the rule, the label in body strong, words as written (ruling R-g1). */}
        <View style={{ gap: 8 }}>
          {progressionParagraphs(cardText(program.progressionNotes)).map((p, i) => (
            <Cited key={i} text={p.text} lead={p.label === null ? undefined : `${p.label} `} />
          ))}
        </View>
      </Section>
      <Section title="After this program">
        <Cited text={cardText(program.afterThisProgram)} />
      </Section>

      {count > 0 ? (
        // Quiet, as the paywall's Terms and Privacy links are: muted and underlined, 44pt tall.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sources, ${count}`}
          accessibilityHint="Lists the research and articles this program is built on"
          onPress={() => setSourcesOpen(true)}
          style={({ pressed }) => ({ marginTop: 16, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', opacity: pressed ? 0.8 : 1 })}
        >
          <Body muted style={{ textDecorationLine: 'underline' }}>{`Sources (${count})`}</Body>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 24 }}>{footer}</View>
      <SourcesSheet program={program} visible={sourcesOpen} onClose={() => setSourcesOpen(false)} />
    </View>
  );
}
