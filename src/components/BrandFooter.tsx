import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * The QRiate+ wordmark, linked home. Two files rather than one recoloured by
 * CSS because the letterforms invert between grounds but the swashes, the QR
 * motif and the raised plus must keep their brand colours.
 */
export function BrandFooter({ width = 104 }: { width?: number }) {
  const height = Math.round((width * 320) / 778);

  return (
    <Link href="/" className="inline-flex items-center" aria-label={PRODUCT_NAME}>
      <Image
        src="/brand/qriate-wordmark.svg"
        alt={PRODUCT_NAME}
        width={width}
        height={height}
        className="h-auto dark:hidden"
        style={{ width }}
      />
      <Image
        src="/brand/qriate-wordmark-light.svg"
        alt={PRODUCT_NAME}
        width={width}
        height={height}
        className="hidden h-auto dark:block"
        style={{ width }}
      />
    </Link>
  );
}
