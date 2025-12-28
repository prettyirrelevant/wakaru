import { type BankParser, BankType } from '~/types';
import { KudaParser } from './kuda';

export { KudaParser };

export function getBankParser(bankType: BankType): BankParser {
  switch (bankType) {
    case BankType.Kuda:
      return new KudaParser();
    default:
      throw new Error(`Unsupported bank type: ${bankType}`);
  }
}
