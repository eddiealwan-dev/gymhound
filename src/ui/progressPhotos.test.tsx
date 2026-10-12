/** @jest-environment node */
import { router } from 'expo-router';
import { Image, Platform, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import PhotosRoute from '../../app/(tabs)/photos';
import PhotoRoute from '../../app/photo/[id]';
import { addProgressPhoto, listProgressPhotos } from '../db/repositories/progressPhotosRepo';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { announce } from '../platform/announce';
import { deleteProgressPhotoFile, pickProgressPhoto, saveProgressPhoto } from '../platform/progressPhotoFiles';
import { Footer } from './Footer';
import { ConfirmSheet, Sheet } from './Sheet';
import { PhotosRow } from './stats/PhotosRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real database: the screens read and write through the progress photo repository, and every write bumps the data
// version, which makes them read again, as on the phone. The files are faked: a name in `mockMissing` has no file.
let mockDb: Db;
let mockId = '';
let mockCanGoBack = true;
const mockMissing = new Set<string>();
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => mockCanGoBack },
  useLocalSearchParams: () => ({ id: mockId }),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('../platform/progressPhotoFiles', () => ({
  pickProgressPhoto: jest.fn(),
  saveProgressPhoto: jest.fn((_uri: string, now: number) => `progress-${now}.jpg`),
  deleteProgressPhotoFile: jest.fn(),
  progressPhotoExists: (name: string) => !mockMissing.has(name),
  progressPhotoUri: (name: string) => `file:///documents/progress-photos/${name}`,
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** Noon on Sunday 11 October 2026, local time. */
const NOW = new Date(2026, 9, 11, 12, 0).getTime();
const TODAY = '2026-10-11';
const at = (m: number, d: number) => new Date(2026, m - 1, d, 9, 0).getTime();
const DENIED = 'Camera access is off. Turn it on in Settings to take a photo.';
const FAILED = "Couldn't save the photo. Try again.";
const originalOS = Platform.OS;
let closeDb: () => void;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  const handle = createTestDb();
  mockDb = handle.db;
  closeDb = handle.close;
  mockId = '';
  mockCanGoBack = true;
  mockMissing.clear();
  jest.mocked(router.push).mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(router.navigate).mockClear();
  jest.mocked(pickProgressPhoto).mockReset();
  jest.mocked(saveProgressPhoto).mockClear();
  jest.mocked(deleteProgressPhotoFile).mockClear();
  jest.mocked(announce).mockClear();
});

afterEach(() => {
  Platform.OS = originalOS;
  jest.useRealTimers();
  closeDb();
});

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Three photos: 1 Sep, 2 Oct and today, by id. */
function threePhotos() {
  const first = addProgressPhoto(mockDb, 'progress-first.jpg', at(9, 1));
  const middle = addProgressPhoto(mockDb, 'progress-middle.jpg', at(10, 2));
  const latest = addProgressPhoto(mockDb, 'progress-latest.jpg', at(10, 11));
  return { first, middle, latest };
}

const texts = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === Text).map((t) => [t.props.children].flat().join(''));
const images = (tree: ReactTestRenderer) => tree.root.findAllByType(Image).map((i) => (i.props.source as { uri: string }).uri);
/** The pressable control labelled `label` (by its screen reader label or its visible label). */
const controls = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) => typeof n.type !== 'string' && (n.props.accessibilityLabel === label || n.props.label === label) && typeof n.props.onPress === 'function',
  );
const control = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = controls(tree, label);
  expect(found.length).toBeGreaterThan(0);
  return found[0];
};
const tap = (tree: ReactTestRenderer, label: string) => act(() => control(tree, label).props.onPress());
/** Taps a choice in the open sheet, then lets the sheet close and the picker answer. */
async function choose(tree: ReactTestRenderer, label: 'Take photo' | 'Choose a photo') {
  tap(tree, label);
  await act(async () => {
    jest.runAllTimers();
  });
}

describe('Stats → Progress photos (R181)', () => {
  it('with none, says why to take one and offers a compact Add a photo', () => {
    const tree = mount(<PhotosRow today={TODAY} />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Progress photos', "A photo now and then shows change a scale can't."]));
    const add = control(tree, 'Add a photo');
    expect(add.props.size).toBe('compact');
    expect(add.props.variant).toBe('secondary');
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('with photos, shows the newest as a 64 × 64 thumbnail and the count, and opens /photos', () => {
    threePhotos();
    const tree = mount(<PhotosRow today={TODAY} />);
    expect(texts(tree)).toContain('3 photos · latest Today');
    const thumbs = tree.root.findAllByType(Image);
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0].props.source).toEqual({ uri: 'file:///documents/progress-photos/progress-latest.jpg' });
    expect(thumbs[0].props.style).toMatchObject({ width: 64, height: 64, borderRadius: 8 });
    tap(tree, 'Progress photos, 3 photos, latest Today');
    expect(router.push).toHaveBeenCalledWith('/photos');
  });

  it('counts one photo as one', () => {
    addProgressPhoto(mockDb, 'progress-1.jpg', at(10, 2));
    const tree = mount(<PhotosRow today={TODAY} />);
    expect(texts(tree)).toContain('1 photo · latest Fri, Oct 2');
  });

  it('hides and does not count a photo whose file is gone (a restored snapshot)', () => {
    threePhotos();
    mockMissing.add('progress-latest.jpg');
    const tree = mount(<PhotosRow today={TODAY} />);
    expect(texts(tree)).toContain('2 photos · latest Fri, Oct 2');
    expect(images(tree)).toEqual(['file:///documents/progress-photos/progress-middle.jpg']);

    mockMissing.add('progress-middle.jpg');
    mockMissing.add('progress-first.jpg');
    const empty = mount(<PhotosRow today={TODAY} />);
    expect(texts(empty)).toContain("A photo now and then shows change a scale can't.");
  });

  it('adds a photo from Stats, after the sheet has closed', async () => {
    jest.mocked(pickProgressPhoto).mockResolvedValue({ status: 'picked', uri: 'file:///cache/out.jpg' });
    const tree = mount(<PhotosRow today={TODAY} />);
    tap(tree, 'Add a photo');
    await choose(tree, 'Take photo');
    expect(pickProgressPhoto).toHaveBeenCalledWith('camera');
    expect(listProgressPhotos(mockDb)).toHaveLength(1);
    expect(texts(tree)).toContain('1 photo · latest Today');
  });

  it('draws nothing on the web (phone builds only)', () => {
    threePhotos();
    Platform.OS = 'web';
    expect(mount(<PhotosRow today={TODAY} />).toJSON()).toBeNull();
  });
});

describe('/photos (R181)', () => {
  it('says the photos stay on this phone, offers a filled Add a photo, and has no footer', () => {
    const tree = mount(<PhotosRoute />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Progress photos', "They stay on this phone. They aren't in backups."]));
    expect(control(tree, 'Add a photo').props.variant ?? 'primary').toBe('primary');
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
  });

  it('goes back to Stats, or to /stats when opened with nothing to go back to', () => {
    const tree = mount(<PhotosRoute />);
    tap(tree, 'Back to Stats');
    expect(router.back).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    tap(tree, 'Back to Stats');
    expect(router.navigate).toHaveBeenCalledWith('/stats');
  });

  it('shows a 3-column grid, newest first, each with its date, opening /photo/{id}', () => {
    const { first, middle, latest } = threePhotos();
    const tree = mount(<PhotosRoute />);
    expect(images(tree)).toEqual([
      'file:///documents/progress-photos/progress-latest.jpg',
      'file:///documents/progress-photos/progress-middle.jpg',
      'file:///documents/progress-photos/progress-first.jpg',
    ]);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Oct 11', 'Oct 2', 'Sep 1']));
    const cell = control(tree, 'Photo, Oct 2');
    expect(cell.parent?.props.style).toMatchObject({ width: '33.333%' });
    tap(tree, 'Photo, Oct 2');
    expect(router.push).toHaveBeenCalledWith(`/photo/${middle}`);
    expect([first, latest]).toHaveLength(2);
  });

  it('hides a photo whose file is gone', () => {
    threePhotos();
    mockMissing.add('progress-middle.jpg');
    const tree = mount(<PhotosRoute />);
    expect(images(tree)).toHaveLength(2);
    expect(controls(tree, 'Photo, Oct 2')).toHaveLength(0);
  });

  it('Add a photo opens a sheet: Take photo, Choose a photo, Cancel', () => {
    const tree = mount(<PhotosRoute />);
    const sheet = () => tree.root.findAllByType(Sheet)[0];
    expect(sheet().props.visible).toBe(false);
    tap(tree, 'Add a photo');
    expect(sheet().props.visible).toBe(true);
    for (const label of ['Take photo', 'Choose a photo', 'Cancel']) expect(controls(tree, label).length).toBeGreaterThan(0);
    tap(tree, 'Cancel');
    expect(sheet().props.visible).toBe(false);
    expect(pickProgressPhoto).not.toHaveBeenCalled();
  });

  it('Choose a photo picks once the sheet has closed, saves the file and stores a row with its name only', async () => {
    jest.mocked(pickProgressPhoto).mockResolvedValue({ status: 'picked', uri: 'file:///cache/out.jpg' });
    const tree = mount(<PhotosRoute />);
    tap(tree, 'Add a photo');
    tap(tree, 'Choose a photo');
    expect(pickProgressPhoto).not.toHaveBeenCalled();
    await act(async () => {
      jest.runAllTimers();
    });
    expect(pickProgressPhoto).toHaveBeenCalledWith('library');
    const savedAt = jest.mocked(saveProgressPhoto).mock.calls[0][1];
    expect(saveProgressPhoto).toHaveBeenCalledWith('file:///cache/out.jpg', savedAt);
    const rows = listProgressPhotos(mockDb);
    expect(rows).toEqual([{ id: expect.any(String), localDate: TODAY, takenAt: savedAt, fileName: `progress-${savedAt}.jpg` }]);
    expect(images(tree)).toEqual([`file:///documents/progress-photos/progress-${savedAt}.jpg`]);
  });

  it('says the camera is off when access was refused, and saves nothing', async () => {
    jest.mocked(pickProgressPhoto).mockResolvedValue({ status: 'denied' });
    const tree = mount(<PhotosRoute />);
    tap(tree, 'Add a photo');
    await choose(tree, 'Take photo');
    expect(texts(tree)).toContain(DENIED);
    expect(announce).toHaveBeenCalledWith(DENIED);
    expect(saveProgressPhoto).not.toHaveBeenCalled();
    expect(listProgressPhotos(mockDb)).toEqual([]);
  });

  it('says nothing when the picker is cancelled', async () => {
    jest.mocked(pickProgressPhoto).mockResolvedValue({ status: 'cancelled' });
    const tree = mount(<PhotosRoute />);
    tap(tree, 'Add a photo');
    await choose(tree, 'Choose a photo');
    expect(texts(tree)).not.toContain(FAILED);
    expect(listProgressPhotos(mockDb)).toEqual([]);
  });

  it('says a failed save failed, and stores no row', async () => {
    jest.mocked(pickProgressPhoto).mockResolvedValue({ status: 'picked', uri: 'file:///cache/out.jpg' });
    jest.mocked(saveProgressPhoto).mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    const tree = mount(<PhotosRoute />);
    tap(tree, 'Add a photo');
    await choose(tree, 'Choose a photo');
    expect(texts(tree)).toContain(FAILED);
    expect(listProgressPhotos(mockDb)).toEqual([]);
  });

  it('says a failed pick failed', async () => {
    jest.mocked(pickProgressPhoto).mockRejectedValue(new Error('no memory'));
    const tree = mount(<PhotosRoute />);
    tap(tree, 'Add a photo');
    await choose(tree, 'Choose a photo');
    expect(texts(tree)).toContain(FAILED);
  });

  it('on the web says the photos are in the phone app, with no Add a photo', () => {
    threePhotos();
    Platform.OS = 'web';
    const tree = mount(<PhotosRoute />);
    expect(texts(tree)).toContain('Progress photos are in the phone app.');
    expect(controls(tree, 'Add a photo')).toHaveLength(0);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });
});

describe('/photo/[id] (R181)', () => {
  it('shows the photo, contained, with its date', () => {
    const { middle } = threePhotos();
    mockId = middle;
    const tree = mount(<PhotoRoute />);
    const shown = tree.root.findAllByType(Image);
    expect(shown).toHaveLength(1);
    expect(shown[0].props.source).toEqual({ uri: 'file:///documents/progress-photos/progress-middle.jpg' });
    expect(shown[0].props.resizeMode).toBe('contain');
    expect(texts(tree)).toContain('Oct 2');
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
  });

  it('‹ goes to the older photo and › to the newer, each disabled at its end', () => {
    const { middle } = threePhotos();
    mockId = middle;
    const tree = mount(<PhotoRoute />);
    expect(control(tree, 'Older photo').props.disabled).toBe(false);
    expect(control(tree, 'Newer photo').props.disabled).toBe(false);

    tap(tree, 'Older photo');
    expect(images(tree)).toEqual(['file:///documents/progress-photos/progress-first.jpg']);
    expect(control(tree, 'Older photo').props.disabled).toBe(true);

    tap(tree, 'Newer photo');
    tap(tree, 'Newer photo');
    expect(images(tree)).toEqual(['file:///documents/progress-photos/progress-latest.jpg']);
    expect(control(tree, 'Newer photo').props.disabled).toBe(true);
    expect(control(tree, 'Older photo').props.label).toBe('‹');
    expect(control(tree, 'Newer photo').props.label).toBe('›');
  });

  it('skips a photo whose file is gone', () => {
    const { latest } = threePhotos();
    mockMissing.add('progress-middle.jpg');
    mockId = latest;
    const tree = mount(<PhotoRoute />);
    tap(tree, 'Older photo');
    expect(images(tree)).toEqual(['file:///documents/progress-photos/progress-first.jpg']);
  });

  it('Side by side shows the earliest photo beside this one, each with its date', () => {
    const { latest } = threePhotos();
    mockId = latest;
    const tree = mount(<PhotoRoute />);
    expect(control(tree, 'Side by side').props.selected).toBe(false);
    tap(tree, 'Side by side');
    expect(control(tree, 'Side by side').props.selected).toBe(true);
    expect(images(tree)).toEqual(['file:///documents/progress-photos/progress-first.jpg', 'file:///documents/progress-photos/progress-latest.jpg']);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Sep 1', 'Oct 11']));
    tap(tree, 'Side by side');
    expect(images(tree)).toHaveLength(1);
  });

  it('Side by side is off for the earliest photo, which has nothing earlier to sit beside', () => {
    const { first } = threePhotos();
    mockId = first;
    const tree = mount(<PhotoRoute />);
    expect(control(tree, 'Side by side').props.disabled).toBe(true);
  });

  it('Delete photo asks first; Keep keeps it', () => {
    const { middle } = threePhotos();
    mockId = middle;
    const tree = mount(<PhotoRoute />);
    const confirm = () => tree.root.findAllByType(ConfirmSheet)[0];
    expect(confirm().props.visible).toBe(false);
    tap(tree, 'Delete photo');
    expect(confirm().props).toMatchObject({ visible: true, title: 'Delete this photo?', body: "It's removed from this phone.", confirmLabel: 'Delete', cancelLabel: 'Keep' });
    act(() => confirm().props.onCancel());
    expect(confirm().props.visible).toBe(false);
    expect(listProgressPhotos(mockDb)).toHaveLength(3);
    expect(deleteProgressPhotoFile).not.toHaveBeenCalled();
  });

  it('Delete removes the row and the file, then shows the next older photo', () => {
    const { middle } = threePhotos();
    mockId = middle;
    const tree = mount(<PhotoRoute />);
    tap(tree, 'Delete photo');
    act(() => tree.root.findAllByType(ConfirmSheet)[0].props.onConfirm());
    expect(listProgressPhotos(mockDb).map((p) => p.fileName)).toEqual(['progress-latest.jpg', 'progress-first.jpg']);
    expect(deleteProgressPhotoFile).toHaveBeenCalledWith('progress-middle.jpg');
    expect(images(tree)).toEqual(['file:///documents/progress-photos/progress-first.jpg']);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('deleting the earliest shows the next newer one; deleting the last one left closes', () => {
    const only = addProgressPhoto(mockDb, 'progress-only.jpg', at(10, 2));
    const newer = addProgressPhoto(mockDb, 'progress-newer.jpg', at(10, 3));
    mockId = only;
    const tree = mount(<PhotoRoute />);
    tap(tree, 'Delete photo');
    act(() => tree.root.findAllByType(ConfirmSheet)[0].props.onConfirm());
    expect(images(tree)).toEqual(['file:///documents/progress-photos/progress-newer.jpg']);

    tap(tree, 'Delete photo');
    act(() => tree.root.findAllByType(ConfirmSheet)[0].props.onConfirm());
    expect(listProgressPhotos(mockDb)).toEqual([]);
    // It closes once the question has gone.
    expect(router.back).not.toHaveBeenCalled();
    act(() => {
      jest.runAllTimers();
    });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(newer).toBeTruthy();
  });

  it('Close goes back, or to /photos when opened with nothing to go back to', () => {
    const { latest } = threePhotos();
    mockId = latest;
    const tree = mount(<PhotoRoute />);
    tap(tree, 'Close');
    expect(router.back).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    tap(tree, 'Close');
    expect(router.navigate).toHaveBeenCalledWith('/photos');
  });

  it('says a photo that is gone is not here, with Close', () => {
    mockId = addProgressPhoto(mockDb, 'progress-gone.jpg', at(10, 2));
    mockMissing.add('progress-gone.jpg');
    const tree = mount(<PhotoRoute />);
    expect(texts(tree)).toContain("That photo isn't here.");
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(controls(tree, 'Close').length).toBeGreaterThan(0);
  });

  it('on the web says the photos are in the phone app', () => {
    const { latest } = threePhotos();
    mockId = latest;
    Platform.OS = 'web';
    const tree = mount(<PhotoRoute />);
    expect(texts(tree)).toContain('Progress photos are in the phone app.');
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });
});
