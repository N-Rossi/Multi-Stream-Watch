"use client";

// The "take". Push copies the draft to the viewer. Until then nothing the
// operator does on control reaches the viewer (preview vs. program).
// Status lamp follows switcher color code: amber = edited preview, green = in sync.

type Props = {
  dirty: boolean;
  version: number;
  onPush: () => void;
  onRevert: () => void;
  onOpenViewer: () => void;
};

export default function PushBar({
  dirty,
  version,
  onPush,
  onRevert,
  onOpenViewer,
}: Props) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-panel border-b border-line shrink-0">
      <button
        onClick={onPush}
        disabled={!dirty}
        title="Publish the draft to the viewer"
        className={[
          "px-4 h-8 text-xs font-display font-bold uppercase tracking-[0.08em] rounded-[3px] transition",
          dirty
            ? "bg-tally text-white hover:brightness-110"
            : "bg-panel2 text-dim border border-line cursor-default",
        ].join(" ")}
      >
        Push to viewer
      </button>

      <div className="flex items-center gap-1.5">
        <span
          className={[
            "w-2 h-2 rounded-[1px]",
            dirty
              ? "bg-amber shadow-[0_0_6px_rgba(255,178,36,0.6)]"
              : "bg-ok shadow-[0_0_6px_rgba(63,185,80,0.5)]",
          ].join(" ")}
        />
        <span className="text-[11px] text-dim">
          {dirty ? "Unpushed changes" : "In sync"}
        </span>
      </div>

      <button
        onClick={onRevert}
        disabled={!dirty}
        title="Discard draft edits and return to the live board"
        className={[
          "px-2.5 h-7 text-[10px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border transition-colors",
          dirty
            ? "border-line bg-panel2 text-dim hover:text-text hover:border-dim"
            : "border-line text-dim/40 cursor-default",
        ].join(" ")}
      >
        Revert to live
      </button>

      <span className="ml-auto text-[10px] font-mono text-dim">v{version}</span>

      <button
        onClick={onOpenViewer}
        title="Open the viewer window for this room"
        className="px-2.5 h-7 text-[10px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border border-line bg-panel2 text-dim hover:text-text hover:border-dim transition-colors"
      >
        Open viewer ↗
      </button>
    </div>
  );
}
