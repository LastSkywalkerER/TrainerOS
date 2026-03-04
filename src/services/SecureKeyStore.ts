// SecureKeyStore: хранит API-ключ зашифрованным в IndexedDB
// Ключ шифрования живёт в sessionStorage (не персистируется между сессиями)
// Зашифрованные данные — в IndexedDB через Dexie

import Dexie from 'dexie';

const SESSION_CRYPTO_KEY = 'trainer-os-crypto-key';
const DB_NAME = 'trainer_os_secure';
const KEY_ID = 'openrouter-api-key';

interface EncryptedEntry {
  id: string;
  iv: string;    // base64
  data: string;  // base64
}

class SecureKeyDb extends Dexie {
  keys!: Dexie.Table<EncryptedEntry, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      keys: 'id',
    });
  }
}

const db = new SecureKeyDb();

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function getCryptoKey(): Promise<CryptoKey | null> {
  const stored = sessionStorage.getItem(SESSION_CRYPTO_KEY);
  if (!stored) return null;
  try {
    const keyData = base64ToBuffer(stored);
    return await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
  } catch {
    return null;
  }
}

async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  const existing = await getCryptoKey();
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const exported = await crypto.subtle.exportKey('raw', key);
  sessionStorage.setItem(SESSION_CRYPTO_KEY, bufferToBase64(exported));
  return key;
}

export const secureKeyStore = {
  async saveKey(apiKey: string): Promise<void> {
    const cryptoKey = await getOrCreateCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(apiKey);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      cryptoKey,
      encoded
    );

    await db.keys.put({
      id: KEY_ID,
      iv: bufferToBase64(iv.buffer as ArrayBuffer),
      data: bufferToBase64(encrypted),
    });
  },

  async loadKey(): Promise<string | null> {
    const cryptoKey = await getCryptoKey();
    if (!cryptoKey) return null;

    const entry = await db.keys.get(KEY_ID);
    if (!entry) return null;

    try {
      const iv = base64ToBuffer(entry.iv);
      const data = base64ToBuffer(entry.data);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
      return new TextDecoder().decode(decrypted);
    } catch {
      return null;
    }
  },

  async clearKey(): Promise<void> {
    await db.keys.delete(KEY_ID);
    sessionStorage.removeItem(SESSION_CRYPTO_KEY);
  },

  // Проверяет, есть ли зашифрованная запись в IndexedDB
  // (не означает что мы можем расшифровать — ключ шифрования мог устареть)
  async hasStoredKey(): Promise<boolean> {
    const entry = await db.keys.get(KEY_ID);
    return !!entry;
  },
};
