This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Operator workflow: Control + Viewer

The app has a two-surface broadcast workflow (preview vs. program):

- **`/control`** — operator surface. Edit a draft board (add feeds by URL, set labels, layout, focus, audio). Nothing reaches the viewer until you press **Push to viewer** (the "take").
- **`/viewer`** — clean program output. Renders only the published board. Open it in a second window, drag it to your second monitor, and fullscreen it once (button or `F`). Future changes arrive via Push with no reload and no re-setup.

Both pages accept an optional `?room=` query param so you can run independent boards (e.g. `/control?room=race2` + `/viewer?room=race2`). Defaults to `default`.

The two pages talk **browser-native only** — no backend, no database, no network. Push sends the board over a `BroadcastChannel` (named `multiviewer:{room}`) and also writes it to `localStorage`, so refreshing the viewer restores the current board instantly and then keeps listening for pushes. Both windows must be in the **same browser** on the **same machine**.

### OBS setup (important)

Capture the viewer window with OBS **Window Capture** (or **Display Capture** on the second monitor) — **not** a Browser Source. A Browser Source runs its own isolated browser instance, so it would never receive the `BroadcastChannel` pushes from your control window.

On Windows, if Window Capture shows black, switch the capture **method** (toggle between *Windows 10 (1903+)* and *BitBlt*), or fall back to **Display Capture** on the monitor where the viewer is fullscreened.

> Note: `9`-up renders nine live players simultaneously — heavy on CPU, GPU, and bandwidth. The viewer requests lower quality where the platform allows it at that layout.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
