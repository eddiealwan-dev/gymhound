import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import Stats from '../../app/(tabs)/stats';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Phase 6 Task 1 (R172): the order of Stats' sections, and the `today` each is given. The sections are tested in their own files. */

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
/** A section that draws its name and the `today` it was given. A declaration, so the hoisted mocks can call it. */
function mockSection(name: string) {
  return function MockSection(props: { today?: string }) {
    const { Text: RNText } = jest.requireActual('react-native');
    return <RNText>{props.today ? `${name} ${props.today}` : name}</RNText>;
  };
}
jest.mock('./stats/CheckInCard', () => ({ CheckInCard: mockSection('CheckInCard') }));
jest.mock('./stats/WeekCard', () => ({ WeekCard: mockSection('WeekCard') }));
jest.mock('./stats/LiftsSection', () => ({ LiftsSection: mockSection('LiftsSection') }));
jest.mock('./stats/StepsCard', () => ({ StepsCard: mockSection('StepsCard') }));
jest.mock('./stats/BodySection', () => ({ BodySection: mockSection('BodySection') }));
jest.mock('./stats/PhotosRow', () => ({ PhotosRow: mockSection('PhotosRow') }));

it('draws Stats, the check-in, This week, Lifts, Steps, Body and Progress photos, in that order, with today', () => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 11, 12, 0).getTime());
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Stats />);
  });
  const texts = tree.root.findAllByType(Text).map((t) => String(t.props.children));
  expect(texts).toEqual([
    'Stats',
    'CheckInCard 2026-10-11',
    'WeekCard 2026-10-11',
    'LiftsSection 2026-10-11',
    'StepsCard',
    'Body',
    'BodySection',
    'PhotosRow 2026-10-11',
  ]);
  jest.restoreAllMocks();
});
