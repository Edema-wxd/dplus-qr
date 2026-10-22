import Image from "next/image";
import Link from "next/link";
import { COMPANY_NAME, MAIN_SITE } from "@/lib/brand";

/**
 * The De Sign Plus logo, linked to the main site. Two files rather than one
 * recoloured by CSS because the logo is multi-coloured: only the ink changes
 * between the light and dark variants.
 */
export function BrandFooter({ width = 110 }: { width?: number }) {
  const height = Math.round((width / 110) * 28);

  return (
    <Link href={MAIN_SITE} className="inline-flex items-center">
      <Image
        src="/brand/logo-b.svg"
        alt={COMPANY_NAME}
        width={width}
        height={height}
        className="dark:hidden"
      />
      <Image
        src="/brand/logo-w.svg"
        alt={COMPANY_NAME}
        width={width}
        height={height}
        className="hidden dark:block"
      />
    </Link>
  );
}
