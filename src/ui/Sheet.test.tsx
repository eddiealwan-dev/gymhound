import { Keyboard, Modal, ScrollView, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Button } from './Button';
import { afterSheetCloses, ConfirmSheet, Sheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// An iPhone SE: 568 points tall, with a 20-point status bar.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 320, height: 568, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const onClose = jest.fn();

function sheet(visible: boolean) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text testID="content">Rest time</Text>
    </Sheet>
  );
}

function mount(visible: boolean): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(sheet(visible));
  });
  return tree;
}

/** The panel the content sits in: the view VoiceOver keeps the focus inside. */
const panel = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === View && n.props.accessibilityViewIsModal === true)[0];

/** The dimmed area above the panel (the content here has nothing to press). */
const backdrop = (tree: ReactTestRenderer) => tree.root.findAll((n) => typeof n.props.onPress === 'function')[0];

const flatStyle = (node: ReactTestInstance) => Object.assign({}, ...[node.props.style].flat());

let dismiss: jest.SpyInstance;

beforeEach(() => {
  onClose.mockClear();
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  dismiss.mockRestore();
});

describe('Sheet: the keyboard goes away when a sheet opens (F1)', () => {
  it('dismisses the keyboard when it becomes visible, and only then', () => {
    const tree = mount(false);
    expect(dismiss).not.toHaveBeenCalled();

    act(() => tree.update(sheet(true)));
    expect(dismiss).toHaveBeenCalledTimes(1);

    // Drawing again while it stays open does not dismiss again.
    act(() => tree.update(sheet(true)));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses the keyboard when it opens already visible', () => {
    mount(true);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet: a tall sheet scrolls and leaves a strip to tap (F2)', () => {
  it('caps the panel at the window height less the top inset and a 48-point strip', () => {
    const tree = mount(true);
    expect(flatStyle(panel(tree)).maxHeight).toBe(568 - 20 - 48);
  });

  it('puts the content inside a ScrollView in the panel', () => {
    const tree = mount(true);
    const scroll = panel(tree).findByType(ScrollView);
    expect(scroll.findByProps({ testID: 'content' })).toBeTruthy();
  });
});

describe('Sheet: VoiceOver can close it without acting (F3)', () => {
  it('has a backdrop that is a button named Close, and it closes', () => {
    const tree = mount(true);
    const strip = backdrop(tree);
    expect(strip.props.accessible).not.toBe(false);
    expect(strip.props.accessibilityRole).toBe('button');
    expect(strip.props.accessibilityLabel).toBe('Close');

    act(() => strip.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps VoiceOver inside the panel, and the escape gesture closes it', () => {
    const tree = mount(true);
    const modal = panel(tree);
    expect(modal).toBeDefined();

    act(() => modal.props.onAccessibilityEscape());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmSheet: which answer is the primary one', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  function confirmSheet(primary?: 'confirm' | 'cancel'): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <ConfirmSheet
          visible
          title="Finish Push A?"
          confirmLabel="Finish anyway"
          cancelLabel="Keep logging"
          primary={primary}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );
    });
    return tree;
  }

  /** The buttons in the order they are drawn, each with its variant (a Button with none is primary). */
  const buttons = (tree: ReactTestRenderer) =>
    tree.root.findAllByType(Button).map((b) => [b.props.label, b.props.variant ?? 'primary']);

  it('puts confirm first as the primary button by default', () => {
    expect(buttons(confirmSheet())).toEqual([
      ['Finish anyway', 'primary'],
      ['Keep logging', 'secondary'],
    ]);
  });

  it("with primary 'cancel', puts cancel first as the primary button and confirm second", () => {
    const tree = confirmSheet('cancel');
    expect(buttons(tree)).toEqual([
      ['Keep logging', 'primary'],
      ['Finish anyway', 'secondary'],
    ]);

    const [cancel, confirm] = tree.root.findAllByType(Button);
    act(() => cancel.props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => confirm.props.onPress());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('still cancels from the backdrop', () => {
    const tree = confirmSheet('cancel');
    act(() => backdrop(tree).props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('afterSheetCloses (Round 10: the share sheet after ⋯)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs once iOS says the sheet has gone, and only once', () => {
    const go = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <Sheet visible onClose={() => {}}>
          <Text>Hi</Text>
        </Sheet>,
      );
    });
    afterSheetCloses(go);
    expect(go).not.toHaveBeenCalled();
    act(() => tree.root.findByType(Modal).props.onDismiss());
    expect(go).toHaveBeenCalledTimes(1);
    act(() => void jest.advanceTimersByTime(1000));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("runs after a second when iOS doesn't say", () => {
    const go = jest.fn();
    afterSheetCloses(go);
    act(() => void jest.advanceTimersByTime(999));
    expect(go).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(1));
    expect(go).toHaveBeenCalledTimes(1);
  });
});
