import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BalanceChart } from '~/components/analytics/balance-chart';
import { FlowChart } from '~/components/analytics/flow-chart';

describe('empty analytics charts', () => {
  it('does not render a cashflow grid without meaningful values', () => {
    render(
      <FlowChart
        currency="NGN"
        data={[
          { month: '2026-01', inflow: 0, outflow: 0 },
          { month: '2026-02', inflow: 0, outflow: 0 },
        ]}
      />
    );

    expect(screen.queryByText('cashflow')).not.toBeInTheDocument();
  });

  it('does not render a balance grid without meaningful values', () => {
    render(
      <BalanceChart
        currency="NGN"
        data={[
          { at: '2026-01-01', balanceMinor: 0 },
          { at: '2026-01-02', balanceMinor: 0 },
        ]}
      />
    );

    expect(screen.queryByText('balance')).not.toBeInTheDocument();
  });
});
