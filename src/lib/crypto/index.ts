import type { Transaction } from '~/types';

interface EncryptedBackup {
  version: number;
  salt: string;
  iv: string;
  data: string;
  createdAt: number;
}

const BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 100000;

/**
 * Derives an encryption key from a password using PBKDF2
 */
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
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
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts transactions with a password
 */
export async function encryptBackup(
  transactions: Transaction[],
  password: string
): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(transactions));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const backup: EncryptedBackup = {
    version: BACKUP_VERSION,
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encrypted),
    createdAt: Date.now(),
  };

  return new Blob([JSON.stringify(backup)], {
    type: 'application/json',
  });
}

/**
 * Decrypts a backup file with a password
 */
export async function decryptBackup(
  file: File,
  password: string
): Promise<Transaction[]> {
  const text = await file.text();
  const backup: EncryptedBackup = JSON.parse(text);

  if (backup.version !== BACKUP_VERSION) {
    throw new Error('Unsupported backup version');
  }

  const salt = base64ToArrayBuffer(backup.salt);
  const iv = base64ToArrayBuffer(backup.iv);
  const encryptedData = base64ToArrayBuffer(backup.data);

  const key = await deriveKey(password, new Uint8Array(salt));

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    const json = decoder.decode(decrypted);
    return JSON.parse(json);
  } catch {
    throw new Error('Invalid password or corrupted backup');
  }
}

/**
 * Downloads an encrypted backup
 */
export function downloadBackup(blob: Blob): void {
  const date = new Date().toISOString().split('T')[0];
  const filename = `wakaru-backup-${date}.wakaru`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper functions
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
