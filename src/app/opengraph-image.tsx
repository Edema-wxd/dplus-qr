import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { CODE_ORIGIN, PRODUCT_NAME } from "@/lib/brand";

/**
 * The social card, generated at build time.
 *
 * Shares are the main route a landing page gets found by, and a card declared
 * with no image is a share that arrives blank. This renders the page's own
 * composition — paper specimen, real symbol, the headline on ink — rather than
 * shipping a raster someone has to remember to regenerate.
 *
 * The symbol is really encoded, so the card scans and leads back here.
 *
 * Sarlotte sets everything on the card, including the sub-line. Satori loads
 * only the faces handed to it, so adding Raleway would mean shipping a second
 * font file into the build for two lines of text; one display voice at card
 * scale reads better than that trade.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${PRODUCT_NAME} — print it once, re-point it forever`;

export default async function OpengraphImage() {
  const sarlotte = await readFile(
    path.join(process.cwd(), "src/fonts/Sarlotte-Bold.otf")
  );
  const wordmark = await readFile(
    path.join(process.cwd(), "public/brand/qriate-wordmark.svg")
  );
  const wordmarkSrc = `data:image/svg+xml;base64,${wordmark.toString("base64")}`;

  const qr = QRCode.create(CODE_ORIGIN, { errorCorrectionLevel: "Q" });
  const n = qr.modules.size;
  let path2 = "";
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (qr.modules.data[y * n + x]) path2 += `M${x} ${y}h1v1h-1z`;
    }
  }
  const quiet = 3;
  const span = n + quiet * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="300" height="300"><rect width="${span}" height="${span}" fill="#FBFAF6"/><g transform="translate(${quiet} ${quiet})"><path d="${path2}" fill="#16191B" shape-rendering="crispEdges"/></g></svg>`;
  const qrSrc = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 420,
            background: "#FBFAF6",
          }}
        >
          <img src={qrSrc} width={300} height={300} alt="" />
          {/*
            The card has to name the product. Without this the only identifier
            was the small host line, which is the domain, not the brand.
          */}
          <img src={wordmarkSrc} width={230} height={95} alt="" style={{ marginTop: 22 }} />
          <div
            style={{
              marginTop: 12,
              fontSize: 18,
              letterSpacing: 2,
              color: "#5E6B72",
              fontFamily: "Sarlotte",
            }}
          >
            qriateplus.com
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Sarlotte",
              fontSize: 76,
              lineHeight: 1.02,
              color: "#F7F9F8",
            }}
          >
            <span>Print it once.</span>
            <span style={{ color: "#7FD0EC" }}>Re-point it forever.</span>
          </div>
          <div
            style={{
              marginTop: 30,
              fontSize: 25,
              lineHeight: 1.45,
              color: "#9AA6AC",
              maxWidth: 560,
              fontFamily: "Sarlotte",
            }}
          >
            Dynamic QR codes for businesses that print things. Billed in naira.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Sarlotte", data: sarlotte, style: "normal", weight: 700 }],
    }
  );
}
