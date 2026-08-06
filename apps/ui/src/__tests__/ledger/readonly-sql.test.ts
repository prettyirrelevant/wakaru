import { describe, it, expect } from 'vitest';
import { assertReadOnlySelect, UnsafeSqlError } from '~/lib/db/readonly-sql';

/**
 * These queries are written by a language model that has been fed transaction
 * descriptions authored by whoever sent the user money. The guard is the only
 * thing standing between a prompt injection and the user's ledger.
 */
describe('assertReadOnlySelect', () => {
  it('accepts a select, normalising comments and a trailing semicolon away', () => {
    expect(assertReadOnlySelect('SELECT 1;')).toBe('SELECT 1');
    expect(assertReadOnlySelect('SELECT 1 -- a comment')).toBe('SELECT 1');
    expect(assertReadOnlySelect('WITH t AS (SELECT 1 AS n) SELECT n FROM t')).toBe(
      'WITH t AS (SELECT 1 AS n) SELECT n FROM t'
    );
  });

  it('does not mistake string contents for statements', () => {
    // A search for "%update%" is not an UPDATE, and a semicolon inside a
    // literal is not a statement separator.
    const like = "SELECT * FROM transactions WHERE search_text LIKE '%update%'";
    const semi = "SELECT * FROM transactions WHERE description = 'a; b'";

    expect(assertReadOnlySelect(like)).toBe(like);
    expect(assertReadOnlySelect(semi)).toBe(semi);
  });

  it('does not mistake OFFSET for SET', () => {
    expect(assertReadOnlySelect('SELECT 1 LIMIT 10 OFFSET 5')).toBe('SELECT 1 LIMIT 10 OFFSET 5');
  });

  it.each([
    ['DELETE', 'DELETE FROM transactions'],
    ['UPDATE', 'UPDATE transactions SET amount_minor = 0'],
    ['INSERT', "INSERT INTO transactions (id) VALUES ('x')"],
    ['DROP', 'DROP TABLE transactions'],
    ['TRUNCATE', 'TRUNCATE transactions'],
    ['ALTER', 'ALTER TABLE transactions ADD COLUMN x INT'],
    ['GRANT', 'GRANT ALL ON transactions TO PUBLIC'],
    ['SET', 'SET search_path TO public'],
    ['BEGIN', 'BEGIN'],
  ])('rejects a bare %s', (_name, sql) => {
    expect(() => assertReadOnlySelect(sql)).toThrow(UnsafeSqlError);
  });

  it.each([
    ['a second statement after a select', 'SELECT 1; DROP TABLE transactions'],
    ['a statement hidden behind a comment', 'SELECT 1 -- \n; DELETE FROM transactions'],
    ['a statement hidden in dollar quotes', 'SELECT $tag$ hi $tag$; DROP TABLE transactions'],
    [
      'a data-modifying CTE, which is legal after WITH',
      'WITH d AS (DELETE FROM transactions RETURNING id) SELECT * FROM d',
    ],
  ])('rejects %s', (_name, sql) => {
    expect(() => assertReadOnlySelect(sql)).toThrow(UnsafeSqlError);
  });

  it.each([
    ['reads a file', "SELECT pg_read_file('/etc/passwd')"],
    ['hangs the page', 'SELECT pg_sleep(60)'],
    ['leaks configuration', "SELECT current_setting('is_superuser')"],
  ])('rejects a function that %s', (_name, sql) => {
    expect(() => assertReadOnlySelect(sql)).toThrow(UnsafeSqlError);
  });

  it('rejects an empty query', () => {
    expect(() => assertReadOnlySelect('   ')).toThrow(UnsafeSqlError);
    expect(() => assertReadOnlySelect('-- nothing here')).toThrow(UnsafeSqlError);
  });
});
