import { extractText, getDocumentProxy } from 'unpdf';

export async function extractTextFromPdf(buffer: ArrayBuffer, password?: string): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer), { password });
  const { text } = await extractText(pdf, { mergePages: true });
  return text as string;
}
