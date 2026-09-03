/** Folder segments: letters, digits, `_`, `-`; joined by single slashes. No traversal. */
const FOLDER_PATTERN = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*$/;
const MAX_FOLDER_LENGTH = 120;

export function isValidFolder(folder: string): boolean {
  return folder.length <= MAX_FOLDER_LENGTH && FOLDER_PATTERN.test(folder);
}

/** Random, user-scoped object key so uploads never collide across users. */
export function buildObjectPath(params: { folder: string | null; userId: string; extension: string }): string {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${params.extension}`;
  const scopedFolder = params.folder ? `${params.folder}/${params.userId}` : params.userId;
  return `${scopedFolder}/${fileName}`;
}
