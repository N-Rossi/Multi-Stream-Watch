"use client";
import { useEffect, useState } from "react";
import { resolveClipMp4 } from "@/lib/twitchClip";

export type ClipMp4 = {
  /** Resolved MP4 URL, or null while loading / after failure. */
  url: string | null;
  /** True once resolution has definitively failed → use the embed fallback. */
  failed: boolean;
};

/**
 * Resolve a Twitch clip slug to its MP4 URL. While resolving, both fields are
 * falsy (render nothing); on failure `failed` flips so the cell can fall back
 * to the clips-embed iframe. Pass null for non-clip sources.
 */
export function useClipMp4(slug: string | null): ClipMp4 {
  const [state, setState] = useState<ClipMp4>({ url: null, failed: false });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setState({ url: null, failed: false });
    resolveClipMp4(slug)
      .then((url) => {
        if (!cancelled)
          setState(url ? { url, failed: false } : { url: null, failed: true });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
