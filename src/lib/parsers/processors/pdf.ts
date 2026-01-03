import { extractText, getDocumentProxy } from 'unpdf';

export async function extractTextFromPdf(buffer: ArrayBuffer, password?: string): Promise<string> {
  const uint8Buffer = new Uint8Array(buffer);
  
  if (password) {
    const pdf = await getDocumentProxy(uint8Buffer, { password });
    const { text } = await extractText(pdf, { mergePages: true });
    return text as string;
  }
  
  const { text } = await extractText(uint8Buffer, { mergePages: true });
  return text as string;
}
