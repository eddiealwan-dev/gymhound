import { act, create } from 'react-test-renderer';
import Routines from '../../app/(tabs)/routines';
import { Footer } from './Footer';
import { Screen } from './Screen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The footer's own look is not under test here, only where it is placed (spec 8.1): Train, History, Stats and Settings.
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/routinesRepo', () => ({ listRoutines: jest.fn(), setActiveRoutine: jest.fn() }));
jest.mock('../state/dataVersion', () => ({
  bumpData: jest.fn(),
  useDbQuery: () => [{ id: 'ppl', name: 'Push Pull Legs', dayCount: 6, isPremade: true, isActive: true }],
}));

function render(element: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(element);
  });
  return tree;
}

describe('the GruntHound footer sits on Train, History, Stats and Settings only (spec 8.1)', () => {
  it('shows on a Screen that asks for it (the check below would otherwise pass for nothing)', () => {
    const tree = render(
      <Screen footer>
        <></>
      </Screen>,
    );
    expect(tree.root.findAllByType(Footer).length).toBe(1);
  });

  it('does not show on Routines', () => {
    const tree = render(<Routines />);
    expect(JSON.stringify(tree.toJSON())).toContain('Push Pull Legs');
    expect(tree.root.findAllByType(Footer).length).toBe(0);
  });
});
