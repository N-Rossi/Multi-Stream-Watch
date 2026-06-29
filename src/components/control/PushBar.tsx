"use client";

// The "take". Push copies the draft to the viewer. Until then nothing the
// operator does on control reaches the viewer (preview vs. program).

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
          "px-4 py-1.5 text-xs font-mono font-semibold rounded transition",
          dirty
            ? "bg-signal text-bg hover:brightness-110"
            : "bg-panel2 text-dim border border-line cursor-default",
        ].join(" ")}
      >
        PUSH TO VIEWER
      </button>

      <div className="flex items-center gap-1.5">
        <span
          className={[
            "w-2 h-2 rounded-full",
            dirty ? "bg-amber animate-pulse" : "bg-signal",
          ].join(" ")}
        />
        <span className="text-[10px] font-mono text-dim">
          {dirty ? "UNPUSHED CHANGES" : "LIVE — IN SYNC"}
        </span>
      </div>

      <button
        onClick={onRevert}
        disabled={!dirty}
        title="Discard draft edits and return to the live board"
        className={[
          "px-2.5 py-1 text-[10px] font-mono rounded border transition-colors",
          dirty
            ? "border-line text-dim hover:text-text hover:border-signal"
            : "border-line text-dim/40 cursor-default",
        ].join(" ")}
      >
        REVERT TO LIVE
      </button>

      <span className="ml-auto text-[10px] font-mono text-dim">v{version}</span>

      <button
        onClick={onOpenViewer}
        title="Open the viewer window for this room"
        className="px-2.5 py-1 text-[10px] font-mono rounded border border-line text-dim hover:text-text hover:border-signal transition-colors"
      >
        OPEN VIEWER ↗
      </button>
    </div>
  );
}
