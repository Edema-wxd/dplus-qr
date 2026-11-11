/* eslint-disable @next/next/no-img-element -- Satori draws these into the PNG; next/image does not apply */
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { getPublicPost } from "@/lib/blog";
import { SLUG_PATTERN, postUrl } from "@/lib/blog-schema";

/**
 * A post's social card, 1200×630, used whenever staff have not set a social
 * image of their own (see `socialImage` in `blog-seo.ts`).
 *
 * The site card's composition: paper on the left with a real symbol, ink on
 * the right with the headline. The symbol encodes the post's own address, so
 * a card shared into a chat and photographed off a screen scans to the post.
 *
 * A route rather than `opengraph-image.tsx` because the file convention would
 * override the metadata, and a post with its own image must be able to win.
 * Its address carries a version (`?v=`, the last save), so it is safe to let
 * caches keep it.
 */
const size = { width: 1200, height: 630 };

function headlineSize(title: string): number {
  if (title.length <= 36) return 76;
  if (title.length <= 60) return 64;
  if (title.length <= 85) return 54;
  return 46;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) return new Response("Not found", { status: 404 });

  const found = await getPublicPost(slug).catch(() => null);
  if (!found || !("post" in found)) return new Response("Not found", { status: 404 });
  const { post } = found;

  const [sarlotte, wordmark] = await Promise.all([
    readFile(path.join(process.cwd(), "src/fonts/Sarlotte-Bold.otf")),
    readFile(path.join(process.cwd(), "public/brand/qriate-wordmark.svg")),
  ]);
  const wordmarkSrc = `data:image/svg+xml;base64,${wordmark.toString("base64")}`;

  const url = postUrl(post.slug);
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let modules = "";
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (qr.modules.data[y * n + x]) modules += `M${x} ${y}h1v1h-1z`;
    }
  }
  const quiet = 4;
  const span = n + quiet * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="280" height="280"><rect width="${span}" height="${span}" fill="#FBFAF6"/><g transform="translate(${quiet} ${quiet})"><path d="${modules}" fill="#16191B" shape-rendering="crispEdges"/></g></svg>`;
  const qrSrc = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const image = new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 400,
            background: "#FBFAF6",
          }}
        >
          <img src={qrSrc} width={280} height={280} alt="" />
          <img src={wordmarkSrc} width={200} height={82} alt="" style={{ marginTop: 22 }} />
          <div style={{ marginTop: 10, fontSize: 18, letterSpacing: 1.5, color: "#5E6B72", fontFamily: "Sarlotte" }}>
            qriateplus.com/blog
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            background: "#16191B",
            padding: "0 64px",
          }}
        >
          {post.category ? (
            <div style={{ fontSize: 24, color: "#7FD0EC", fontFamily: "Sarlotte", marginBottom: 22 }}>{post.category}</div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontFamily: "Sarlotte",
              fontSize: headlineSize(post.title),
              lineHeight: 1.04,
              color: "#F7F9F8",
              maxWidth: 680,
            }}
          >
            {post.title}
          </div>
          {post.authorName ? (
            <div style={{ marginTop: 30, fontSize: 24, color: "#9AA6AC", fontFamily: "Sarlotte" }}>{post.authorName}</div>
          ) : null}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Sarlotte", data: sarlotte, style: "normal", weight: 700 }],
    }
  );

  image.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  return image;
}
