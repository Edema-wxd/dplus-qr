"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui's Sonner toaster, fitted to this site.
 *
 * The stock component reads the theme from `next-themes`. This app has no
 * theme switch, and a toast is drawn in one material everywhere: the ink of
 * the dashboard shell, so it reads as something laid over the page rather
 * than part of it, on the paper dashboard, the hosted pages and the status
 * pages alike. The theme is therefore fixed, and the colours come from the
 * `.toaster` tokens in globals.css.
 */
function Toaster({ className, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className={cn("toaster group", className)}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--toast-bg)",
          "--normal-text": "var(--toast-ink)",
          "--normal-border": "var(--toast-rule)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
