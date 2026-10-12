import { loadOptional, nativeEnv, type NativeEnv } from '../native/optional';
import type { CloudFolder } from './cloudCopy';

/**
 * PHASE 7 (iOS build): GymHound's iCloud container through `react-native-cloud-storage` (3.x), behind `CloudFolder`
 * (§17.2, R303). The app-data scope is the container's hidden part: it survives a lost phone with the same Apple ID,
 * and nobody can move or break the files in the Files app ("Save a backup copy" stays the visible copy). The types are
 * the slice of the package GymHound uses, written here because it is not installed until phase 7.
 */

export const CLOUD_DIR = '/snapshots';
const APP_DATA = 'app_data';
const SQLITE = 'application/vnd.sqlite3';

export type CloudStorageLike = {
  isCloudAvailable(): Promise<boolean>;
  exists(path: string, scope?: string): Promise<boolean>;
  mkdir(path: string, scope?: string): Promise<void>;
  readdir(path: string, scope?: string): Promise<string[]>;
  uploadFile(remotePath: string, localPath: string, options: { mimeType: string }, scope?: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string, scope?: string): Promise<void>;
  unlink(path: string, scope?: string): Promise<void>;
};

const remote = (name: string) => `${CLOUD_DIR}/${name}`;

export function createICloudFolder(storage: CloudStorageLike): CloudFolder {
  const ensureDir = async () => {
    if (!(await storage.exists(CLOUD_DIR, APP_DATA))) await storage.mkdir(CLOUD_DIR, APP_DATA);
  };
  return {
    async isAvailable() {
      try {
        return await storage.isCloudAvailable();
      } catch {
        return false;
      }
    },
    async list() {
      if (!(await storage.exists(CLOUD_DIR, APP_DATA))) return [];
      // Names only, whether the module lists names or paths.
      return (await storage.readdir(CLOUD_DIR, APP_DATA)).map((entry) => entry.split('/').pop() ?? entry);
    },
    async upload(name, localPath) {
      await ensureDir();
      await storage.uploadFile(remote(name), localPath, { mimeType: SQLITE }, APP_DATA);
    },
    download: (name, localPath) => storage.downloadFile(remote(name), localPath, APP_DATA),
    remove: (name) => storage.unlink(remote(name), APP_DATA),
  };
}

/** The iCloud folder, or null on Android (its own backup carries the snapshots), on the web, in Expo Go, or without the package. */
export function loadCloudFolder(env: NativeEnv = nativeEnv()): CloudFolder | null {
  if (env.os !== 'ios') return null;
  const module = loadOptional<{ CloudStorage?: CloudStorageLike }>(() => require('react-native-cloud-storage'), env);
  const storage = module?.CloudStorage;
  return storage && typeof storage.uploadFile === 'function' ? createICloudFolder(storage) : null;
}

let folder: CloudFolder | null | undefined;

/** The app's one cloud folder, made on first use. */
export function getCloudFolder(): CloudFolder | null {
  if (folder === undefined) folder = loadCloudFolder();
  return folder;
}
