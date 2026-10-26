import { env } from "@/lib/env";

/**
 * Whether uploads can work on this deployment. Without a token UploadThing
 * refuses every request, so the dashboard hides the button rather than
 * offering one that fails after the owner has picked a file.
 */
export function uploadsEnabled(): boolean {
  return Boolean(env().UPLOADTHING_TOKEN);
}
