/**
 * Pin a Postgres connection string's TLS mode to what `pg` already does.
 *
 * Neon writes `sslmode=require` into `DATABASE_URL` and
 * `DATABASE_URL_UNPOOLED`. `pg` 8 treats `prefer`, `require` and `verify-ca`
 * as aliases for `verify-full`, so today the certificate and hostname are
 * both checked, but it warns on every cold start that `pg` 9 will give them
 * their weaker libpq meanings: `require` then encrypts without verifying who
 * is on the other end. Saying `verify-full` outright keeps the current check
 * through that upgrade and silences the warning.
 *
 * Applied where a pool is built rather than in the stored strings, which are
 * Neon-managed and never hand-edited (`neon env pull` would put them back).
 * Only the `sslmode` value is rewritten; the rest of the string, password
 * included, passes through byte for byte. `disable`, `no-verify`, an absent
 * mode (a local database) and `verify-full` itself are left alone.
 */
export function pinSslMode(connectionString: string): string {
  return connectionString.replace(
    /([?&]sslmode=)(prefer|require|verify-ca)(?=&|#|$)/,
    "$1verify-full"
  );
}
