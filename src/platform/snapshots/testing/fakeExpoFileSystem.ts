/**
 * A stand-in for `expo-file-system` (SDK 57) backed by Node `fs`, for Jest. Tests install it with
 * `jest.mock('expo-file-system', () => require('./testing/fakeExpoFileSystem'))`.
 *
 * It models the semantics the snapshot code depends on, as read from the iOS source (`FileSystemPath.swift`):
 * - `copySync` and `moveSync` refuse an existing target unless `{ overwrite: true }`, and fail when the source is missing.
 * - `File.delete()` throws when the file is not there.
 * - `File.exists` is false for a directory, and `Directory.exists` is false for a file.
 * - `Directory.create` fails when the folder exists, unless `idempotent`, and when the parent is missing, unless `intermediates`.
 * - A `File` cannot be built from a URI with a trailing slash.
 * - URIs are `file://` URLs. The native side turns one into a path by decoding it once, so a folder literally named
 *   `%40anonymous%2Fx` (Expo Go's) is reached only through `%2540anonymous%252Fx`.
 *
 * Every real file operation goes through a property of `fs` at call time (`fs.renameSync`, `fs.copyFileSync`), so a test
 * can `jest.spyOn(fs, ...)` to make one fail, the same way it does for the Node implementation.
 */
import fs from 'node:fs';

type Options = { overwrite?: boolean; intermediates?: boolean; idempotent?: boolean };

/** How the native side builds an absolute URL for a path: `%` becomes `%25` and a space `%20`. */
const toUri = (path: string, isDirectory: boolean) => `file://${encodeURI(path)}${isDirectory && !path.endsWith('/') ? '/' : ''}`;

/** How the native side turns a URL back into a path: it decodes once, and a directory URL's trailing slash is not part of the path. */
const toPath = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');

const isFile = (path: string) => fs.existsSync(path) && fs.statSync(path).isFile();
const isDirectory = (path: string) => fs.existsSync(path) && fs.statSync(path).isDirectory();

abstract class FsPath {
  protected path: string;

  constructor(...uris: (string | FsPath)[]) {
    const [first] = uris;
    this.path = toPath(typeof first === 'string' ? first : first.uri);
  }

  abstract get uri(): string;

  protected destination(to: FsPath): string {
    return to.path;
  }

  /** Shared by both kinds of path: a target that exists is an error unless `overwrite`, in which case it is replaced. */
  protected clearTarget(target: string, options?: Options): void {
    if (!fs.existsSync(target)) return;
    if (!options?.overwrite) throw new Error(`${target} already exists`);
    fs.rmSync(target, { recursive: true });
  }
}

export class File extends FsPath {
  constructor(...uris: (string | FsPath)[]) {
    super(...uris);
    const [first] = uris;
    if (typeof first === 'string' && first.endsWith('/')) throw new Error('tried to create a file with a directory path');
  }

  get uri(): string {
    return toUri(this.path, false);
  }

  get exists(): boolean {
    return isFile(this.path);
  }

  get size(): number {
    return this.exists ? fs.statSync(this.path).size : 0;
  }

  delete(): void {
    if (!fs.existsSync(this.path)) throw new Error('path does not exist');
    fs.rmSync(this.path);
  }

  copySync(to: FsPath, options?: Options): void {
    const target = this.destination(to);
    this.clearTarget(target, options);
    fs.copyFileSync(this.path, target);
  }

  moveSync(to: FsPath, options?: Options): void {
    const target = this.destination(to);
    this.clearTarget(target, options);
    fs.renameSync(this.path, target);
    this.path = target; // like the real one, the File now points at its new location
  }
}

export class Directory extends FsPath {
  get uri(): string {
    return toUri(this.path, true);
  }

  get exists(): boolean {
    return isDirectory(this.path);
  }

  create(options?: Options): void {
    if (this.exists) {
      if (options?.idempotent) return;
      throw new Error(`${this.path} already exists`);
    }
    fs.mkdirSync(this.path, { recursive: options?.intermediates === true });
  }

  list(): (File | Directory)[] {
    return fs.readdirSync(this.path).map((name) => {
      const child = `${this.path}/${name}`;
      return isDirectory(child) ? new Directory(toUri(child, true)) : new File(toUri(child, false));
    });
  }
}

let documentDirectory = '';

/** Tests set where `Paths.document` points: an absolute path with forward slashes. */
export function setDocumentDirectory(path: string): void {
  documentDirectory = path;
}

export const Paths = {
  get document(): Directory {
    return new Directory(toUri(documentDirectory, true));
  },
};
