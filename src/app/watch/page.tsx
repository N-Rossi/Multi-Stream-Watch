import type { Metadata } from "next";
import Multiviewer from "@/components/Multiviewer";

export const metadata: Metadata = {
  title: "Solo watch — Multiviewer",
  description:
    "All-in-one race board: watch up to 9 live streams in one window.",
};

export default function WatchPage() {
  return <Multiviewer />;
}
