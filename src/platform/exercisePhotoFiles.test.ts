/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { deleteCustomExercise, createCustomExercise } from '../db/repositories/customExercisesRepo';
import { getOwnPhotos, setOwnPhoto } from '../db/repositories/exercisePhotosRepo';
import { seededDb } from '../db/testing/fixtures';
import {
  cropToThreeByTwo,
  deleteExercisePhotoFile,
  photoFileExists,
  photoUri,
  pickPhoto,
  saveExercisePhoto,
} from './exercisePhotoFiles';
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
            return { uri: 'file:///cache/ImageManipulator/out.jpg', width: 720, height: 480 };
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-photos-'));
  documents = posix(path.join(root, 'v1', '%40anonymous%2Fgymhound x'));
  fs.mkdirSync(documents, { recursive: true });
  setDocumentDirectory(documents);
  mockManipulations.length = 0;
  jest.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('saveExercisePhoto', () => {
  it('moves the photo into exercise-photos/ in the documents folder and returns only its file name', () => {
    const temp = tempPhoto();
    const name = saveExercisePhoto(temp, 'wall-sit', 'start', NOW);

    expect(name).toBe(`wall-sit-start-${NOW}.jpg`);
    expect(name).not.toContain('/');
    expect(name).not.toContain('file:');
    expect(fs.readFileSync(`${documents}/exercise-photos/${name}`, 'utf8')).toBe('jpeg bytes');
    // The cache copy is gone: it was moved, not copied.
    expect(fs.existsSync(path.join(root, 'cache', 'picked.jpg'))).toBe(false);
  });

  it('makes the folder the first time and reuses it after', () => {
    saveExercisePhoto(tempPhoto('a.jpg'), 'wall-sit', 'start', NOW);
    saveExercisePhoto(tempPhoto('b.jpg'), 'wall-sit', 'end', NOW + 1);
    expect(fs.readdirSync(`${documents}/exercise-photos`).sort()).toEqual([`wall-sit-end-${NOW + 1}.jpg`, `wall-sit-start-${NOW}.jpg`]);
  });
});

describe('photoUri', () => {
  it('resolves a name against the documents folder each time, so a moved app folder still finds its photos (R111)', () => {
    const db = seededDb();
    const name = saveExercisePhoto(tempPhoto(), 'wall-sit', 'start', NOW);
    setOwnPhoto(db, 'wall-sit', 'start', name, NOW);
    expect(photoFileExists(name)).toBe(true);

    // An app update on iOS moves the whole container: the documents folder now lives somewhere else.
    const moved = posix(path.join(root, 'v2', '%40anonymous%2Fgymhound x'));
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.renameSync(documents, moved);
    setDocumentDirectory(moved);

    const stored = getOwnPhotos(db, 'wall-sit').start!;
    expect(stored).toBe(name);
    expect(photoUri(stored)).toBe(fileUri(`${moved}/exercise-photos/${name}`));
    expect(photoFileExists(stored)).toBe(true);
  });
});

describe('photoFileExists', () => {
  it('is false for a name with no file (a restored snapshot can name one deleted since)', () => {
    expect(photoFileExists('wall-sit-start-1.jpg')).toBe(false);
  });

  it('is false for a name that is not a plain file name', () => {
    fs.writeFileSync(`${documents}/outside.jpg`, 'x');
    expect(photoFileExists('../outside.jpg')).toBe(false);
    expect(photoFileExists('')).toBe(false);
  });
});

describe('deleteExercisePhotoFile', () => {
  it('deletes the file', () => {
    const name = saveExercisePhoto(tempPhoto(), 'wall-sit', 'start', NOW);
    deleteExercisePhotoFile(name);
    expect(fs.existsSync(`${documents}/exercise-photos/${name}`)).toBe(false);
  });

  it('is fine when the file is not there, or the folder is not', () => {
    expect(() => deleteExercisePhotoFile('wall-sit-start-1.jpg')).not.toThrow();
    saveExercisePhoto(tempPhoto(), 'wall-sit', 'start', NOW);
    expect(() => deleteExercisePhotoFile('wall-sit-start-1.jpg')).not.toThrow();
  });

  it('never reaches outside the photo folder', () => {
    fs.writeFileSync(`${documents}/outside.jpg`, 'x');
    deleteExercisePhotoFile('../outside.jpg');
    expect(fs.existsSync(`${documents}/outside.jpg`)).toBe(true);
  });

  it('removes the files of a deleted unused custom exercise, as the editor wires it (R109)', () => {
    const db = seededDb();
    const id = createCustomExercise(db, { name: 'Landmine press', primaryMuscles: ['front_delts'], secondaryMuscles: [], equipment: 'barbell', loggingType: 'weighted' }, NOW);
    const start = saveExercisePhoto(tempPhoto('a.jpg'), id, 'start', NOW);
    const end = saveExercisePhoto(tempPhoto('b.jpg'), id, 'end', NOW);
    setOwnPhoto(db, id, 'start', start, NOW);
    setOwnPhoto(db, id, 'end', end, NOW);

    expect(deleteCustomExercise(db, id, (names) => names.forEach(deleteExercisePhotoFile))).toBe('deleted');
    expect(fs.readdirSync(`${documents}/exercise-photos`)).toEqual([]);
  });
});

describe('cropToThreeByTwo', () => {
  it('cuts the sides off a wide photo, centred', () => {
    expect(cropToThreeByTwo(2000, 1000)).toEqual({ originX: 250, originY: 0, width: 1500, height: 1000 });
  });

  it('cuts the top and bottom off a tall or square photo, centred (iOS crops square whatever the aspect)', () => {
    expect(cropToThreeByTwo(1200, 1200)).toEqual({ originX: 0, originY: 200, width: 1200, height: 800 });
    expect(cropToThreeByTwo(3000, 4000)).toEqual({ originX: 0, originY: 1000, width: 3000, height: 2000 });
  });

  it('leaves a photo that is already 3:2 alone, and one it cannot measure', () => {
    expect(cropToThreeByTwo(1500, 1000)).toBeNull();
    expect(cropToThreeByTwo(1501, 1000)).toBeNull();
    expect(cropToThreeByTwo(0, 0)).toBeNull();
  });
});

describe('pickPhoto', () => {
  const picked = (width: number, height: number) => ({ canceled: false, assets: [{ uri: 'file:///cache/picker/photo.jpg', width, height }] });

  it('chooses from the library cropped 3:2, then saves it 720 px wide as a JPEG at 0.7', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked(1200, 1200) as never);

    await expect(pickPhoto('library')).resolves.toEqual({ status: 'picked', uri: 'file:///cache/ImageManipulator/out.jpg' });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 2], quality: 1 });
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(mockManipulations).toEqual([
      [
        ['manipulate', 'file:///cache/picker/photo.jpg'],
        ['crop', { originX: 0, originY: 200, width: 1200, height: 800 }],
        ['resize', { width: 720 }],
        ['save', { format: ImageManipulator.SaveFormat.JPEG, compress: 0.7 }],
        ['release ref'],
        ['release context'],
      ],
    ]);
  });

  it('asks for the camera, then takes a photo the same way', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as never);
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(picked(1500, 1000) as never);

    await expect(pickPhoto('camera')).resolves.toEqual({ status: 'picked', uri: 'file:///cache/ImageManipulator/out.jpg' });
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 2], quality: 1 });
    // Already 3:2: no crop.
    expect(mockManipulations[0].map((step) => (step as unknown[])[0])).toEqual(['manipulate', 'resize', 'save', 'release ref', 'release context']);
  });

  it('says the camera was refused, and opens nothing', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as never);
    await expect(pickPhoto('camera')).resolves.toEqual({ status: 'denied' });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('says it was cancelled, and makes no file', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null } as never);
    await expect(pickPhoto('library')).resolves.toEqual({ status: 'cancelled' });
    expect(mockManipulations).toEqual([]);
  });
});
