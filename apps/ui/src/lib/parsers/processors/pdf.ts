import { extractText, getDocumentProxy } from 'unpdf';

export type PdfPasswordReason = 'required' | 'incorrect';

/**
 * Raised instead of leaking pdf.js's message strings, which four callers used
 * to sniff with `.includes('password')`.
 */
export class PdfPasswordError extends Error {
  readonly reason: PdfPasswordReason;

  constructor(reason: PdfPasswordReason) {
    super(reason === 'required' ? 'This PDF needs a password' : 'Incorrect password');
    this.name = 'PdfPasswordError';
    this.reason = reason;
  }
}

/** pdf.js signals both cases through PasswordException with a numeric code. */
const PASSWORD_EXCEPTION = 'PasswordException';
const NEED_PASSWORD_CODE = 1;

function asPasswordError(error: unknown, passwordSupplied: boolean): PdfPasswordError | null {
  if (typeof error !== 'object' || error === null) return null;

  const candidate = error as { name?: string; code?: number; message?: string };
  const isPasswordException =
    candidate.name === PASSWORD_EXCEPTION ||
    /password/i.test(candidate.message ?? '') ||
    /encrypted/i.test(candidate.message ?? '');

  if (!isPasswordException) return null;

  if (candidate.code === NEED_PASSWORD_CODE && !passwordSupplied) {
    return new PdfPasswordError('required');
  }

  return new PdfPasswordError(passwordSupplied ? 'incorrect' : 'required');
}

export async function extractTextFromPdf(buffer: ArrayBuffer, password?: string): Promise<string> {
  try {
    const pdf = await getDocumentProxy(buffer, { password });
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  } catch (error) {
    const passwordError = asPasswordError(error, Boolean(password));
    if (passwordError) throw passwordError;
    throw error;
  }
}
