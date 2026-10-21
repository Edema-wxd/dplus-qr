/**
 * Minimal environment for unit tests.
 *
 * `env()` validates the whole contract at once, so a test that exercises any
 * module touching config needs DATABASE_URL present or it fails with an
 * environment error rather than the behaviour under test.
 *
 * Deliberately NOT setting the Neon Auth, storage or Redis variables: tests
 * assert the graceful-degradation paths, and a real credential must never be
 * needed to run `npm test`.
 */
// NODE_ENV is already "test" under Jest, and its type is read-only.
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
