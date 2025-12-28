import type { Transaction } from '~/types';
import { TransactionCategory } from '~/types';
import { formatCurrency } from '~/lib/utils';

export function processBasicQuery(
  query: string,
  transactions: Transaction[]
): string {
  const q = query.toLowerCase();

  // Total spending
  if (q.includes('total') && (q.includes('spend') || q.includes('spent') || q.includes('spending') || q.includes('outflow') || q.includes('expense'))) {
    const total = transactions
      .filter((t) => t.category === TransactionCategory.Outflow)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return `total spending: ${formatCurrency(total)}`;
  }

  // Total income
  if (q.includes('total') && (q.includes('income') || q.includes('inflow') || q.includes('earn') || q.includes('received'))) {
    const total = transactions
      .filter((t) => t.category === TransactionCategory.Inflow)
      .reduce((sum, t) => sum + t.amount, 0);
    return `total income: ${formatCurrency(total)}`;
  }

  // Last month spending/income
  if (q.includes('last month') || q.includes('previous month')) {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const monthName = lastMonth.toLocaleDateString('en-NG', { month: 'long' });

    if (q.includes('income') || q.includes('earn') || q.includes('received')) {
      const total = transactions
        .filter((t) => {
          const date = new Date(t.date);
          return t.category === TransactionCategory.Inflow && date >= lastMonth && date <= lastMonthEnd;
        })
        .reduce((sum, t) => sum + t.amount, 0);
      return `${monthName} income: ${formatCurrency(total)}`;
    } else {
      const total = transactions
        .filter((t) => {
          const date = new Date(t.date);
          return t.category === TransactionCategory.Outflow && date >= lastMonth && date <= lastMonthEnd;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      return `${monthName} spending: ${formatCurrency(total)}`;
    }
  }

  // Biggest expense
  if (q.includes('biggest') || q.includes('largest') || q.includes('highest')) {
    const outflows = transactions.filter((t) => t.category === TransactionCategory.Outflow);
    if (outflows.length > 0) {
      const biggest = outflows.reduce((max, t) => 
        Math.abs(t.amount) > Math.abs(max.amount) ? t : max
      );
      return `biggest expense: ${formatCurrency(Math.abs(biggest.amount))} - ${biggest.description}`;
    }
  }

  // Transaction count
  if (q.includes('how many') || q.includes('count')) {
    return `${transactions.length} transactions`;
  }

  // Average spending
  if (q.includes('average')) {
    const outflows = transactions.filter((t) => t.category === TransactionCategory.Outflow);
    if (outflows.length > 0) {
      const avg = outflows.reduce((sum, t) => sum + Math.abs(t.amount), 0) / outflows.length;
      return `average expense: ${formatCurrency(avg)}`;
    }
    return 'no expenses recorded';
  }

  // Balance/Net
  if (q.includes('balance') || q.includes('net') || q.includes('left')) {
    const inflow = transactions
      .filter((t) => t.category === TransactionCategory.Inflow)
      .reduce((sum, t) => sum + t.amount, 0);
    const outflow = transactions
      .filter((t) => t.category === TransactionCategory.Outflow)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const net = inflow - outflow;
    return `net balance: ${net >= 0 ? '+' : ''}${formatCurrency(net)}`;
  }

  // Default: try to give a helpful summary if no pattern matches
  const totalOut = transactions
    .filter((t) => t.category === TransactionCategory.Outflow)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalIn = transactions
    .filter((t) => t.category === TransactionCategory.Inflow)
    .reduce((sum, t) => sum + t.amount, 0);
  
  return `summary:
• total spending: ${formatCurrency(totalOut)}
• total income: ${formatCurrency(totalIn)}
• net: ${formatCurrency(totalIn - totalOut)}
• transactions: ${transactions.length}

try: "biggest expense", "last month spending", "average expense"`;
}
