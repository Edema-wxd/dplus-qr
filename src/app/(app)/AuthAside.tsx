import { ScanIllustration } from "./ScanIllustration";

/** The picture beside the sign-in and sign-up forms. */
export function AuthAside() {
  return (
    <figure className="w-full max-w-md">
      <ScanIllustration className="w-full h-auto" />
      <figcaption className="mt-8">
        <p className="font-sarlotte text-2xl leading-tight">
          Print it once. Point it anywhere.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Change where your code leads at any time, without reprinting a thing.
        </p>
      </figcaption>
    </figure>
  );
}
