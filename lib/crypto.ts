'use client';

import { ENC_PREFIX, KEY_STORAGE } from '@/lib/constants';

const PBKDF2_ITERATIONS = 120_000;

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]!);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: BufferSource) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** Stable per-origin salt so the same password always yields the same key. */
function originSalt(extra = 'master'): ArrayBuffer {
  const base = `${location.origin}:pathpad:${extra}`;
  const bytes = new TextEncoder().encode(base.padEnd(32, '0').slice(0, 32));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function deriveMasterKey(password: string) {
  return deriveKey(password, originSalt('master'));
}

export async function deriveShareKey(password: string, slug: string) {
  return deriveKey(password, originSalt(`share:${slug}`));
}

export async function exportKey(key: CryptoKey) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64(raw);
}

export async function importKey(b64: string) {
  return crypto.subtle.importKey('raw', fromBase64(b64), { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** Remember vault on this device until Lock (localStorage for everyday multi-tab / reopen). */
export function saveKeyToDevice(b64: string) {
  try {
    localStorage.setItem(KEY_STORAGE, b64);
  } catch {
    // ignore
  }
}

export function loadKeyFromDevice(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function clearKeyFromDevice() {
  try {
    localStorage.removeItem(KEY_STORAGE);
    sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // ignore
  }
}

export async function encryptText(plain: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain)
  );
  return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(cipher)}`;
}

export async function decryptText(payload: string, key: CryptoKey) {
  if (!payload) return '';
  if (!payload.startsWith(ENC_PREFIX)) {
    return payload;
  }

  const body = payload.slice(ENC_PREFIX.length);
  const [ivB64, cipherB64] = body.split(':');
  if (!ivB64 || !cipherB64) throw new Error('Invalid encrypted note format.');

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    key,
    fromBase64(cipherB64)
  );
  return new TextDecoder().decode(plain);
}

export function isEncryptedPayload(payload: string) {
  return payload.startsWith(ENC_PREFIX);
}
