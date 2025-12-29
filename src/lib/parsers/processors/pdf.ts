import { extractText } from 'unpdf';
import type { RawRow } from '~/types';

interface ParsedTransaction {
  dateTime: string;
  description: string;
  amount: string;
  transactionId: string;
}

function parseTransactionsFromText(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  
  // MM/DD/YYYY HH:MM:SS AM/PM ... +/-AMOUNT TXID
  const datePattern = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+(?:AM|PM))/gi;
  const chunks = text.split(datePattern).filter(Boolean);
  
  // chunks[0] = header, chunks[1] = date1, chunks[2] = content1, chunks[3] = date2, etc.
  for (let i = 1; i < chunks.length - 1; i += 2) {
    const dateTime = chunks[i].trim();
    const rest = chunks[i + 1]?.trim() || '';
    
    if (!dateTime || !rest) continue;
    if (rest.includes('Transaction Date') || rest.includes('Transaction Detail')) continue;
    
    // Find +/-AMOUNT.NN pattern - amount always has sign prefix and 2 decimal places
    const amountMatch = rest.match(/([+-]\d+(?:,\d{3})*\.\d{2})/);
    
    if (amountMatch) {
      const amount = amountMatch[1];
      const amountIndex = rest.indexOf(amount);
      const description = rest.slice(0, amountIndex).trim();
      const transactionId = rest.slice(amountIndex + amount.length).trim();
      
      transactions.push({
        dateTime,
        description,
        amount,
        transactionId,
      });
    }
  }
  
  return transactions;
}

export async function extractRowsFromPdf(buffer: ArrayBuffer): Promise<RawRow[]> {
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });

  const transactions = parseTransactionsFromText(text as string);
  const rows: RawRow[] = [];

  for (const tx of transactions) {
    rows.push([
      `${tx.dateTime} ${tx.description}`,
      tx.amount,
      tx.transactionId,
    ]);
  }

  return rows;
}
