"use client";

// Landing hub. Its one job: route people to the right surface — the control
// room (which brings its viewer along in a new tab) or the solo watch board.

const CARD =
  "group relative flex flex-col gap-2.5 rounded-[4px] border p-5 transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2";

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-display font-semibold uppercase tracking-[0.25em] text-dim">
      <span className={`w-1.5 h-1.5 rounded-[1px] ${color}`} />
      {children}
    </span>
  );
}

export default function Home() {
  // The pair: viewer opens in its own tab (drag it to the big screen), then
  // this tab becomes the control room.
  const openControlAndViewer = (e: React.MouseEvent) => {
    // Modified clicks (new tab / new window) keep native anchor behavior.
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    window.open("/viewer", "_blank", "noopener");
    window.location.href = "/control";
  };

  return (
    <main className="min-h-full flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-3xl">
        {/* Brand */}
        <header className="flex flex-col items-center text-center gap-3 mb-12">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-[1px] bg-tally shadow-[0_0_8px_#FF453A]" />
            <h1 className="font-display italic font-bold text-3xl tracking-wide uppercase text-text">
              Multiviewer
            </h1>
          </div>
          <p className="text-sm text-dim max-w-md leading-relaxed">
            A race board for live streams — up to nine feeds on one screen.
            <br />
            <span className="font-mono text-[11px] text-dim/80">
              YouTube · Twitch · Kick &amp; More!
            </span>
          </p>
        </header>

        {/* The pair: control room + its viewer */}
        <a
          href="/control"
          onClick={openControlAndViewer}
          className={`${CARD} border-amber/60 bg-amber/[0.07] shadow-[inset_0_0_12px_rgba(255,178,36,0.10)] hover:border-amber hover:bg-amber/[0.12] md:flex-row md:items-center md:gap-6`}
        >
          <div className="flex flex-col gap-2.5 md:flex-1">
            <Chip color="bg-amber shadow-[0_0_5px_#FFB224]">Operator</Chip>
            <h2 className="font-display font-bold text-xl uppercase tracking-wide text-text">
              Control &amp; Viewer
            </h2>
            <p className="text-[13px] text-dim leading-relaxed">
              Build the board: line up streams, set labels, pick the layout and
              who has audio. The viewer opens in a new tab — put it fullscreen
              on a TV or second monitor. Nothing changes there until you press
              Push.
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-amber">
            Open control &amp; viewer{" "}
            <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </a>

        {/* Or: the self-contained unit */}
        <div className="flex items-center gap-3 my-6" aria-hidden>
          <span className="flex-1 h-px bg-line" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-dim/70">
            or
          </span>
          <span className="flex-1 h-px bg-line" />
        </div>

        <a
          href="/watch"
          className={`${CARD} border-line bg-panel hover:border-dim md:flex-row md:items-center md:gap-6`}
        >
          <div className="flex flex-col gap-2.5 md:flex-1">
            <Chip color="bg-text/70">All-in-one</Chip>
            <h2 className="font-display font-bold text-xl uppercase tracking-wide text-text">
              Single Screen
            </h2>
            <p className="text-[13px] text-dim leading-relaxed">
              Everything in one window: paste URLs, pick a layout, choose the
              audio you want.
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-text/80">
            Start watching{" "}
            <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </a>

        {/* Rooms footnote */}
        <p className="mt-10 text-center text-[11px] text-dim/80 leading-relaxed">
          Control and viewer pair by room:{" "}
          <code className="font-mono text-dim">/control?room=race</code> drives{" "}
          <code className="font-mono text-dim">/viewer?room=race</code>. Share
          the viewer link to put the same board on any screen.
        </p>
      </div>
    </main>
  );
}
