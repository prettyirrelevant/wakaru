import { extractText } from 'unpdf';

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return text as string;
}
