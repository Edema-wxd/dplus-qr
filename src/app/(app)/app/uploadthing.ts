import { generateReactHelpers } from "@uploadthing/react";
import type { UploadRouter } from "@/app/api/uploadthing/core";

/** Typed against our router, so an endpoint name that does not exist fails to compile. */
export const { useUploadThing } = generateReactHelpers<UploadRouter>();
