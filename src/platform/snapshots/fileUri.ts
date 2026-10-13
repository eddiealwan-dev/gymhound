/**
 * The `file://` URI for an absolute path. Each segment is percent-encoded, which matters: Expo Go's own
 * document folder has a literal `%40` in its name, so the URI for it reads `%2540`.
 */
export function fileUri(path: string): string {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** The absolute path a `file://` URI points to, without a trailing slash. Decodes once, so it is the inverse of `fileUri`. */
export function pathFromUri(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
}
