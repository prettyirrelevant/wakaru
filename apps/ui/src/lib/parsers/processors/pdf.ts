import { extractText, getDocumentProxy } from 'unpdf';

export async function extractTextFromPdf(buffer: ArrayBuffer, password?: string): Promise<string> {
  const pdf = await getDocumentProxy(buffer, { password });
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}
