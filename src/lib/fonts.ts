import localFont from "next/font/local";
import { Raleway } from "next/font/google";

/** Display face, used for headings only. */
export const sarlotte = localFont({
  src: [
    { path: "../fonts/Sarlotte-Regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/Sarlotte-Bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-sarlotte",
  display: "swap",
});

export const raleway = Raleway({
  subsets: ["latin"],
  variable: "--font-raleway",
  display: "swap",
});
