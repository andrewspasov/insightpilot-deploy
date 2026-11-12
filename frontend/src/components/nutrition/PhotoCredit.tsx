import { cn } from "@/lib/utils";
import type { PhotoAttribution } from "@/types/nutrition";

// "Photo by <photographer> on <Unsplash>", both linked, as Unsplash's API
// guidelines ask. Clicks don't reach the row or card underneath.
export default function PhotoCredit({
  attribution,
  className,
}: {
  attribution: PhotoAttribution | null | undefined;
  className?: string;
}) {
  if (!attribution) return null;
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const link = "underline underline-offset-2 hover:opacity-80";
  return (
    <span className={cn("text-[10px] leading-tight", className)}>
      Photo
      {attribution.photographer && (
        <>
          {" by "}
          <a
            href={attribution.photographer_url}
            target="_blank"
            rel="noopener noreferrer"
            className={link}
            onClick={stop}
            onPointerDown={stop}
          >
            {attribution.photographer}
          </a>
        </>
      )}
      {" on "}
      <a
        href={attribution.provider_url}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
        onClick={stop}
        onPointerDown={stop}
      >
        {attribution.provider}
      </a>
    </span>
  );
}
