import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Table, TableBody } from './table';
import { ListSkeleton, TableSkeletonRows } from './table-skeleton';

describe('TableSkeletonRows', () => {
  it('renders the given number of busy rows with one cell per column kind', () => {
    render(
      <Table>
        <TableBody>
          <TableSkeletonRows
            rows={3}
            testId="row"
            cells={['thumb', 'twoLine', 'number', 'badge']}
          />
        </TableBody>
      </Table>,
    );
    const rows = screen.getAllByTestId('row');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveAttribute('aria-busy', 'true');
      expect(within(row).getAllByRole('cell')).toHaveLength(4);
    }
  });

  it('defaults to 5 rows', () => {
    render(
      <Table>
        <TableBody>
          <TableSkeletonRows testId="row" cells={['text']} />
        </TableBody>
      </Table>,
    );
    expect(screen.getAllByTestId('row')).toHaveLength(5);
  });
});

describe('ListSkeleton', () => {
  it('is busy and is not announced as a list of items', () => {
    render(<ListSkeleton testId="list" rows={4} />);
    expect(screen.getByTestId('list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
