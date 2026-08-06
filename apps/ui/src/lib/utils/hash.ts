/**
 * FNV-1a, 64-bit. The old 32-bit hash produced collisions often enough at a
 * few thousand transactions to silently drop rows, so widen it. Deterministic
 * and synchronous, which matters because transaction ids are derived from
 * content and must be reproducible across re-imports.
 */
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export function hash64(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Join parts with a separator that cannot appear in a hashed component. */
export function hashParts(...parts: (string | number | undefined | null)[]): string {
  return hash64(parts.map((p) => (p === undefined || p === null ? '' : String(p))).join('\u0000'));
}

/** SHA-256 of file bytes, used to recognise a statement we already imported. */
export async function hashBytes(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
