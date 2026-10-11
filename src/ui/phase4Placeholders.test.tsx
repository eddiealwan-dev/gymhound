import { act, create } from 'react-test-renderer';
import SavedWorkout from '../../app/(tabs)/saved/[id]';
import BodyDetail from '../../app/(tabs)/body/[kind]';
import ExerciseEditor from '../../app/exercise/[id]';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The phase 4 routes exist from Task 1 (R123), so later tasks can link to them; each says it is not built yet, as Stats does.
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const shown = (element: React.ReactElement) => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(element);
  });
  return JSON.stringify(tree.toJSON());
};

it.each([
  ['exercise/[id]', ExerciseEditor],
  ['saved/[id]', SavedWorkout],
  ['body/[kind]', BodyDetail],
])('%s is a placeholder', (_route, Placeholder) => {
  expect(shown(<Placeholder />)).toContain('Not built yet.');
});
