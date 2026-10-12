import { Image, Linking, Platform, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { getOwnPhotos, setOwnPhoto } from '../db/repositories/exercisePhotosRepo';
import { announce } from '../platform/announce';
import { deleteExercisePhotoFile, photoFileExists, pickPhoto, saveExercisePhoto } from '../platform/exercisePhotoFiles';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';
import { OwnPhotos } from './OwnPhotos';
import { ConfirmSheet, Sheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../platform/announce', () => ({ ...jest.requireActual('../platform/announce'), announce: jest.fn() }));
jest.mock('../state/dataVersion', () => {
  const actual = jest.requireActual<typeof import('../state/dataVersion')>('../state/dataVersion');
  return { ...actual, bumpData: jest.fn(() => actual.bumpData()) };
});
jest.mock('../db/repositories/exercisePhotosRepo', () => ({ getOwnPhotos: jest.fn(), setOwnPhoto: jest.fn() }));
jest.mock('../platform/exercisePhotoFiles', () => ({
  pickPhoto: jest.fn(),
  saveExercisePhoto: jest.fn(),
  deleteExercisePhotoFile: jest.fn(),
  photoFileExists: jest.fn(() => true),
  photoUri: (name: string) => `file:///documents/exercise-photos/${name}`,
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const NOW = new Date(2026, 9, 11, 9, 0).getTime();
const DENIED = 'Camera access is off. Turn it on in Settings to take a photo.';
const originalOS = Platform.OS;

/** The rows the repository holds, by exercise; `setOwnPhoto` writes them as the real one does. */
let mockRows: Record<string, { start: string | null; end: string | null }>;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockRows = {};
  jest.mocked(getOwnPhotos).mockReset().mockImplementation((_db, id) => mockRows[id] ?? { start: null, end: null });
  jest.mocked(setOwnPhoto).mockReset().mockImplementation((_db, id, slot, name) => {
    const row = mockRows[id] ?? { start: null, end: null };
    const old = row[slot];
    mockRows[id] = { ...row, [slot]: name };
    return old !== name ? old : null;
  });
  jest.mocked(pickPhoto).mockReset();
  jest.mocked(saveExercisePhoto).mockReset().mockImplementation((_uri, id, slot, now) => `${id}-${slot}-${now}.jpg`);
  jest.mocked(deleteExercisePhotoFile).mockReset();
  jest.mocked(photoFileExists).mockReset().mockReturnValue(true);
  jest.mocked(bumpData).mockClear();
  jest.mocked(announce).mockClear();
});

afterEach(() => {
  Platform.OS = originalOS;
  jest.useRealTimers();
});

function mount(exerciseId = 'wall-sit'): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<OwnPhotos exerciseId={exerciseId} />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === Text).map((t) => t.props.children);
const buttonsLabelled = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(Button).filter((b) => (b.props.accessibilityLabel ?? b.props.label) === label);
const button = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = buttonsLabelled(tree, label);
  expect(found).toHaveLength(1);
  return found[0];
};
const tap = (tree: ReactTestRenderer, label: string) => act(() => button(tree, label).props.onPress());
/** The time the last picked photo was saved at, which names its file. */
const savedAt = () => jest.mocked(saveExercisePhoto).mock.calls[0][3];
const chooser = (tree: ReactTestRenderer) => tree.root.findAllByType(Sheet)[0];
/** Taps a choice in the open sheet, then lets the sheet close and the picker answer. */
async function choose(tree: ReactTestRenderer, label: 'Take photo' | 'Choose a photo') {
  act(() => button(tree, label).props.onPress());
  await act(async () => {
    jest.runAllTimers();
  });
}

describe('your own photos (R111)', () => {
  it('shows two empty slots, each with Add', () => {
    const tree = mount();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Start photo', 'End photo']));
    expect(button(tree, 'Add start photo').props.label).toBe('Add');
    expect(button(tree, 'Add end photo').props.label).toBe('Add');
    expect(button(tree, 'Add start photo').props.size).toBe('compact');
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('shows a set photo as a 120 × 80 thumbnail with Replace and Remove', () => {
    mockRows['wall-sit'] = { start: 'wall-sit-start-1.jpg', end: null };
    const tree = mount();
    const images = tree.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toEqual({ uri: 'file:///documents/exercise-photos/wall-sit-start-1.jpg' });
    expect(images[0].props.style).toMatchObject({ width: 120, height: 80 });
    // Not a repeat of the slot's heading for the screen reader.
    expect(images[0].props.accessibilityLabel).toBe('Your start photo');
    expect(button(tree, 'Replace start photo').props.label).toBe('Replace');
    expect(button(tree, 'Remove start photo').props.label).toBe('Remove');
    expect(buttonsLabelled(tree, 'Add end photo')).toHaveLength(1);
  });

  it('treats a named file that is gone as an empty slot', () => {
    mockRows['wall-sit'] = { start: 'wall-sit-start-1.jpg', end: null };
    jest.mocked(photoFileExists).mockReturnValue(false);
    const tree = mount();
    expect(buttonsLabelled(tree, 'Add start photo')).toHaveLength(1);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('Add opens a sheet: Take photo, Choose a photo, Cancel', () => {
    const tree = mount();
    expect(chooser(tree).props.visible).toBe(false);
    tap(tree, 'Add start photo');
    expect(chooser(tree).props.visible).toBe(true);
    for (const label of ['Take photo', 'Choose a photo', 'Cancel']) expect(buttonsLabelled(tree, label)).toHaveLength(1);
    tap(tree, 'Cancel');
    expect(chooser(tree).props.visible).toBe(false);
    expect(pickPhoto).not.toHaveBeenCalled();
  });

  it('Choose a photo picks from the library once the sheet has closed, saves it and stores its name', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ status: 'picked', uri: 'file:///cache/out.jpg' });
    const tree = mount();
    tap(tree, 'Add end photo');
    act(() => button(tree, 'Choose a photo').props.onPress());
    expect(chooser(tree).props.visible).toBe(false);
    expect(pickPhoto).not.toHaveBeenCalled();
    await act(async () => {
      jest.runAllTimers();
    });

    expect(pickPhoto).toHaveBeenCalledWith('library');
    const at = savedAt();
    expect(at).toBeGreaterThanOrEqual(NOW);
    expect(saveExercisePhoto).toHaveBeenCalledWith('file:///cache/out.jpg', 'wall-sit', 'end', at);
    expect(setOwnPhoto).toHaveBeenCalledWith('db', 'wall-sit', 'end', `wall-sit-end-${at}.jpg`, at);
    expect(deleteExercisePhotoFile).not.toHaveBeenCalled();
    expect(bumpData).toHaveBeenCalled();
    expect(button(tree, 'Replace end photo')).toBeTruthy();
  });

  it('Replace deletes the old file once the new one is stored', async () => {
    mockRows['wall-sit'] = { start: 'wall-sit-start-1.jpg', end: null };
    jest.mocked(pickPhoto).mockResolvedValue({ status: 'picked', uri: 'file:///cache/out.jpg' });
    const tree = mount();
    tap(tree, 'Replace start photo');
    await choose(tree, 'Take photo');

    expect(pickPhoto).toHaveBeenCalledWith('camera');
    const at = savedAt();
    expect(setOwnPhoto).toHaveBeenCalledWith('db', 'wall-sit', 'start', `wall-sit-start-${at}.jpg`, at);
    expect(deleteExercisePhotoFile).toHaveBeenCalledWith('wall-sit-start-1.jpg');
    expect(tree.root.findAllByType(Image)[0].props.source).toEqual({ uri: `file:///documents/exercise-photos/wall-sit-start-${at}.jpg` });
  });

  it('stores nothing when the picker is cancelled', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ status: 'cancelled' });
    const tree = mount();
    tap(tree, 'Add start photo');
    await choose(tree, 'Choose a photo');

    expect(saveExercisePhoto).not.toHaveBeenCalled();
    expect(setOwnPhoto).not.toHaveBeenCalled();
    expect(bumpData).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain(DENIED);
  });

  it('says how to turn the camera on when access is off', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ status: 'denied' });
    const tree = mount();
    tap(tree, 'Add start photo');
    await choose(tree, 'Take photo');

    expect(texts(tree)).toContain(DENIED);
    const line = tree.root.findAll((n) => n.type === Text && n.props.children === DENIED)[0];
    expect(line.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#a39d90' })]));
    // Said once: by announce, on both phones, and not again by a live region on Android.
    expect(announce).toHaveBeenCalledWith(DENIED);
    expect(line.props.accessibilityLiveRegion).toBeUndefined();
    expect(setOwnPhoto).not.toHaveBeenCalled();
  });

  it('offers Open Settings under the line when the camera is off (R409)', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    try {
      jest.mocked(pickPhoto).mockResolvedValue({ status: 'denied' });
      const tree = mount();
      expect(buttonsLabelled(tree, 'Open Settings to turn on the camera')).toHaveLength(0);
      tap(tree, 'Add start photo');
      await choose(tree, 'Take photo');
      tap(tree, 'Open Settings to turn on the camera');
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      open.mockRestore();
    }
  });

  it('deletes the saved file again if storing its name fails', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ status: 'picked', uri: 'file:///cache/out.jpg' });
    jest.mocked(setOwnPhoto).mockImplementation(() => {
      throw new Error('disk I/O error');
    });
    const tree = mount();
    tap(tree, 'Add start photo');
    await choose(tree, 'Choose a photo');

    expect(deleteExercisePhotoFile).toHaveBeenCalledWith(`wall-sit-start-${savedAt()}.jpg`);
    expect(texts(tree)).toContain("That photo couldn't be saved.");
  });

  const removeSheet = (tree: ReactTestRenderer) => tree.root.findAllByType(ConfirmSheet).find((c) => c.props.title === 'Remove this photo?')!;

  it('Remove asks first, and Keep keeps the photo', () => {
    mockRows['wall-sit'] = { start: 'wall-sit-start-1.jpg', end: null };
    const tree = mount();
    expect(removeSheet(tree).props.visible).toBe(false);
    tap(tree, 'Remove start photo');
    expect(removeSheet(tree).props).toMatchObject({ visible: true, confirmLabel: 'Remove', cancelLabel: 'Keep' });
    expect(setOwnPhoto).not.toHaveBeenCalled();

    act(() => removeSheet(tree).props.onCancel());
    expect(removeSheet(tree).props.visible).toBe(false);
    expect(setOwnPhoto).not.toHaveBeenCalled();
    expect(deleteExercisePhotoFile).not.toHaveBeenCalled();
  });

  it('says so when a photo cannot be removed', () => {
    mockRows['wall-sit'] = { start: 'wall-sit-start-1.jpg', end: null };
    jest.mocked(setOwnPhoto).mockImplementation(() => {
      throw new Error('disk I/O error');
    });
    const tree = mount();
    tap(tree, 'Remove start photo');
    act(() => removeSheet(tree).props.onConfirm());

    expect(removeSheet(tree).props.visible).toBe(false);
    expect(texts(tree)).toContain("That photo couldn't be saved.");
    expect(announce).toHaveBeenCalledWith("That photo couldn't be saved.");
    expect(deleteExercisePhotoFile).not.toHaveBeenCalled();
    expect(buttonsLabelled(tree, 'Replace start photo')).toHaveLength(1);
  });

  it('Remove, once confirmed, clears the slot and deletes the file', () => {
    mockRows['wall-sit'] = { start: 'wall-sit-start-1.jpg', end: 'wall-sit-end-1.jpg' };
    const tree = mount();
    tap(tree, 'Remove end photo');
    act(() => removeSheet(tree).props.onConfirm());

    expect(removeSheet(tree).props.visible).toBe(false);
    expect(setOwnPhoto).toHaveBeenCalledWith('db', 'wall-sit', 'end', null, NOW);
    expect(deleteExercisePhotoFile).toHaveBeenCalledWith('wall-sit-end-1.jpg');
    expect(bumpData).toHaveBeenCalled();
    expect(buttonsLabelled(tree, 'Add end photo')).toHaveLength(1);
  });

  it('shows nothing for an exercise with bundled photos: they are never replaced', () => {
    const tree = mount('barbell-back-squat');
    expect(tree.toJSON()).toBeNull();
    expect(getOwnPhotos).not.toHaveBeenCalled();
  });

  it('shows nothing on web: photos are a phone feature', () => {
    Platform.OS = 'web';
    const tree = mount();
    expect(tree.toJSON()).toBeNull();
    expect(getOwnPhotos).not.toHaveBeenCalled();
  });
});
