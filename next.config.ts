import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode indicator badge (bottom-left "N") floats ABOVE the app,
  // which means above the viewer's iframes. Twitch vetoes a player START if
  // ANYTHING overlaps its iframe — verified live 2026-08-04: with a stream
  // focused (iframe = whole viewport) the badge occluded it and freshly
  // created players sat frozen on the play button; hiding the badge let the
  // same player autoplay. Production has no badge, so this also makes dev
  // behave like prod. Compile/runtime errors still surface.
  devIndicators: false,
};

export default nextConfig;
