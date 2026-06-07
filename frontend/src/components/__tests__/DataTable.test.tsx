import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';

type Row = { symbol: string; gap: number };
const columns: ColumnDef<Row>[] = [
  { accessorKey: 'symbol', header: '标的' },
  { accessorKey: 'gap', header: '低估' },
];
const data: Row[] = [
  { symbol: 'AAA', gap: -8 },
  { symbol: 'BBB', gap: -12 },
];

describe('DataTable', () => {
  it('renders headers and rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('标的')).toBeInTheDocument();
    expect(screen.getByText('AAA')).toBeInTheDocument();
    expect(screen.getByText('BBB')).toBeInTheDocument();
  });

  it('sorts when a header is clicked', async () => {
    render(<DataTable columns={columns} data={data} />);
    await userEvent.click(screen.getByText('低估'));
    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(within(rows[0]).getByText('BBB')).toBeInTheDocument(); // -12 sorts first asc
  });
});
