/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  deleteProgressPhotoFile,
  pickProgressPhoto,
  progressPhotoExists,
  progressPhotoUri,
  saveProgressPhoto,
} from './progressPhotoFiles';
import { fileUri } from './snapshots/fileUri';
import { setDocumentDirectory } from './snapshots/testing/fakeExpoFileSystem';

// The files run over a stand-in for expo-file-system backed by Node `fs` (see the fake for what it models).
jest.mock('expo-file-system', () => require('./snapshots/testing/fakeExpoFileSystem'));

/** What the manipulator was asked to do, in order, for the test to read. */
const mockManipulations: unknown[][] = [];
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: {
    manipulate: jest.fn((uri: string) => {
      const steps: unknown[] = [['manipulate', uri]];
      mockManipulations.push(steps);
      const context = {
        crop: (rect: unknown) => (steps.push(['crop', rect]), context),
        resize: (size: unknown) => (steps.push(['resize', size]), context),
        renderAsync: async () => ({
          saveAsync: async (options: unknown) => {
            steps.push(['save', options]);
            return { uri: 'file:///cache/ImageManipulator/out.jpg', width: 1080, height: 1440 };
          },
          release: () => steps.push(['release ref']),
        }),
        release: () => steps.push(['release context']),
      };
      return context;
    }),
  },
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const NOW = new Date(2026, 9, 11, 9, 0).getTime();

const posix = (p: string) => p.replace(/\\/g, '/');

let root: string;
/** The app's documents folder, named like Expo Go's (a literal %40 and %2F) plus a space: the awkward case for URIs. */
let documents: string;

/** A picked photo waiting in the cache, as the manipulator leaves it: its file:// uri. */
function tempPhoto(name = 'picked.jpg', content = 'jpeg bytes'): string {
  const dir = path.join(root, 'cache');
  fs.mkdirSync(dir, { recursive: true });
  const file = posix(path.join(dir, name));
  fs.writeFileSync(file, content);
  return fileUri(file);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-progress-'));
  documents = posix(path.join(root, 'v1', '%40anonymous%2Fgymhound x'));
  fs.mkdirSync(documents, { recursive: true });
  setDocumentDirectory(documents);
  mockManipulations.length = 0;
  jest.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('saveProgressPhoto (R181)', () => {
  it('moves the photo into progress-photos/ in the documents folder as progress-{now}.jpg, and returns only the name', () => {
    const name = saveProgressPhoto(tempPhoto(), NOW);
    expect(name).toBe(`progress-${NOW}.jpg`);
    expect(fs.readFileSync(`${documents}/progress-photos/${name}`, 'utf8')).toBe('jpeg bytes');
    // Moved, not copied.
    expect(fs.existsSync(path.join(root, 'cache', 'picked.jpg'))).toBe(false);
  });

  it('makes the folder the first time and reuses it after', () => {
    saveProgressPhoto(tempPhoto('a.jpg'), NOW);
    saveProgressPhoto(tempPhoto('b.jpg'), NOW + 1);
    expect(fs.readdirSync(`${documents}/progress-photos`).sort()).toEqual([`progress-${NOW}.jpg`, `progress-${NOW + 1}.jpg`]);
  });
});

describe('progressPhotoUri and progressPhotoExists', () => {
  it('resolve a name against the documents folder each time, so a moved app folder still finds its photos', () => {
    const name = saveProgressPhoto(tempPhoto(), NOW);
    expect(progressPhotoExists(name)).toBe(true);

    // An app update on iOS moves the whole container: the documents folder now lives somewhere else.
    const moved = posix(path.join(root, 'v2', '%40anonymous%2Fgymhound x'));
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.renameSync(documents, moved);
    setDocumentDirectory(moved);

    expect(progressPhotoUri(name)).toBe(fileUri(`${moved}/progress-photos/${name}`));
    expect(progressPhotoExists(name)).toBe(true);
  });

  it('is false for a name with no file (a restored snapshot), or a name that is not a plain file name', () => {
    expect(progressPhotoExists(`progress-${NOW}.jpg`)).toBe(false);
    fs.writeFileSync(`${documents}/outside.jpg`, 'x');
    expect(progressPhotoExists('../outside.jpg')).toBe(false);
    expect(progressPhotoExists('')).toBe(false);
  });
});

describe('deleteProgressPhotoFile', () => {
  it('deletes the file', () => {
    const name = saveProgressPhoto(tempPhoto(), NOW);
    deleteProgressPhotoFile(name);
    expect(fs.existsSync(`${documents}/progress-photos/${name}`)).toBe(false);
  });

  it('never throws: no file, no folder', () => {
    expect(() => deleteProgressPhotoFile('progress-1.jpg')).not.toThrow();
    saveProgressPhoto(tempPhoto(), NOW);
    expect(() => deleteProgressPhotoFile('progress-1.jpg')).not.toThrow();
  });

  it('never reaches outside the photo folder', () => {
    fs.writeFileSync(`${documents}/outside.jpg`, 'x');
    deleteProgressPhotoFile('../outside.jpg');
    expect(fs.existsSync(`${documents}/outside.jpg`)).toBe(true);
  });

  it('leaves the exercise photos alone', () => {
    fs.mkdirSync(`${documents}/exercise-photos`);
    fs.writeFileSync(`${documents}/exercise-photos/progress-1.jpg`, 'x');
    deleteProgressPhotoFile('progress-1.jpg');
    expect(fs.existsSync(`${documents}/exercise-photos/progress-1.jpg`)).toBe(true);
  });
});

describe('pickProgressPhoto (R181)', () => {
  const picked = (width: number, height: number) => ({ canceled: false, assets: [{ uri: 'file:///cache/picker/photo.jpg', width, height }] });
  const OPTIONS = { mediaTypes: ['images'], allowsEditing: false, quality: 1 };
  const stepNames = (i = 0) => mockManipulations[i].map((step) => (step as unknown[])[0]);

  it('chooses from the library uncropped, then saves it 1080 px wide as a JPEG at 0.8', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked(3024, 4032) as never);

    await expect(pickProgressPhoto('library')).resolves.toEqual({ status: 'picked', uri: 'file:///cache/ImageManipulator/out.jpg' });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(OPTIONS);
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(mockManipulations).toEqual([
      [
        ['manipulate', 'file:///cache/picker/photo.jpg'],
        ['resize', { width: 1080 }],
        ['save', { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 }],
        ['release ref'],
        ['release context'],
      ],
    ]);
  });

  it('keeps a photo no wider than 1080 at its size, but still writes it afresh, which leaves its location data behind', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked(1080, 1920) as never);
    await pickProgressPhoto('library');
    expect(stepNames()).toEqual(['manipulate', 'save', 'release ref', 'release context']);

    mockManipulations.length = 0;
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked(0, 0) as never);
    await pickProgressPhoto('library');
    expect(stepNames()).toEqual(['manipulate', 'save', 'release ref', 'release context']);
  });

  it('asks for the camera, then takes a photo the same way', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as never);
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(picked(4032, 3024) as never);

    await expect(pickProgressPhoto('camera')).resolves.toEqual({ status: 'picked', uri: 'file:///cache/ImageManipulator/out.jpg' });
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(OPTIONS);
    expect(mockManipulations[0]).toContainEqual(['resize', { width: 1080 }]);
  });

  it('says the camera was refused, and opens nothing', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as never);
    await expect(pickProgressPhoto('camera')).resolves.toEqual({ status: 'denied' });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('says it was cancelled, and makes no file', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null } as never);
    await expect(pickProgressPhoto('library')).resolves.toEqual({ status: 'cancelled' });
    expect(mockManipulations).toEqual([]);
  });

  it('releases the manipulator when writing fails', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked(3024, 4032) as never);
    jest.mocked(ImageManipulator.ImageManipulator.manipulate).mockImplementationOnce((() => {
      const steps: unknown[] = [['manipulate']];
      mockManipulations.push(steps);
      const context = {
        resize: () => context,
        renderAsync: async () => {
          throw new Error('render failed');
        },
        release: () => steps.push(['release context']),
      };
      return context;
    }) as never);
    await expect(pickProgressPhoto('library')).rejects.toThrow('render failed');
    expect(stepNames()).toEqual(['manipulate', 'release context']);
  });
});
