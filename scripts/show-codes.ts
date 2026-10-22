/**
 * Print existing codes as scannable QR images in the terminal.
 *
 *   npm run codes
 *   npm run codes -- --base https://dplus-qr.vercel.app
 *
 * Unlike `seed:codes` this creates nothing and changes nothing, so the codes
 * keep working between runs. Use it to scan with a real phone.
 *
 * The encoded content is always `<base>/<short_code>` -- the short URL, never
 * the destination. That is what makes the code dynamic.
 */
import { Pool } from "pg";
import QRCode from "qrcode";

type Row = {
  short_code: string;
  name: string;
  status: string;
  destination_url: string;
  owner: string;
  sub_ok: boolean;
};

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }

  const baseIndex = process.argv.indexOf("--base");
  const base = (
    baseIndex === -1 ? process.env.QR_BASE_URL : process.argv[baseIndex + 1]
  )?.replace(/\/$/, "");

  if (!base) {
    console.error("No base URL. Pass --base <url> or set QR_BASE_URL.");
    process.exit(1);
  }

  if (!base.startsWith("https://qr.de-signplus.com")) {
    console.warn(
      `\n  Note: these codes encode ${base}.\n` +
        "  A printed code can never change host, so do not print anything\n" +
        "  generated against a demo URL.\n"
    );
  }

  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query<Row>(`
      select c.short_code, c.name, c.status, c.destination_url,
             u.name as owner,
             coalesce(
               s.status = 'active' or (s.status = 'past_due' and s.grace_until > now()),
               false
             ) as sub_ok
      from qr_codes c
      join qr_users u on u.id = c.user_id
      left join qr_subscriptions s
        on s.user_id = c.user_id and s.status in ('active', 'past_due')
      order by c.id
    `);

    if (rows.length === 0) {
      console.log("No codes yet. Run `npm run seed:codes`.");
      return;
    }

    for (const row of rows) {
      const url = `${base}/${row.short_code}`;
      // What a scanner will actually land on.
      const lands =
        row.status === "blocked"
          ? "the blocked page"
          : row.status === "paused" || !row.sub_ok
            ? "the paused page"
            : row.destination_url;

      console.log(`\n  ${row.name}  [${row.status}${row.sub_ok ? "" : ", lapsed"}]`);
      console.log(`  ${url}`);
      console.log(`  lands on: ${lands}`);
      console.log(await QRCode.toString(url, { type: "terminal", small: true }));
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
