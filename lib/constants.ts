export const SESSION_COOKIE = 'pathpad_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const TRASH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days in trash

export const MAX_NOTE_BYTES = 500_000;
export const AUTOSAVE_MS = 500;
export const MAX_RECENTS = 24;

export const NOTES_INDEX_KEY = 'notes:index';
export const NOTES_TRASH_KEY = 'notes:trash';
export const CRYPTO_SALT_KEY = 'pathpad:crypto-salt';

export const LOGIN_RATE_LIMIT = 12;
export const LOGIN_RATE_WINDOW_SECONDS = 15 * 60;

export const DRAFT_PREFIX = 'pathpad-draft:';
export const KEY_STORAGE = 'pathpad-vault-key';
export const THEME_STORAGE = 'pathpad-theme';
export const LOCAL_RECENTS_KEY = 'pathpad-recent-notes';

/** Prefix for client-encrypted payloads stored in Redis. */
export const ENC_PREFIX = 'v1:';
