import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reel",
  description: "AI-native film pre-production: script to budget, trustworthy and sourced.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* h-full (not min-h-full): <main className="overflow-y-auto"> in the
          project layout, and components like ChatPanel/OverheadWorkspace
          that put their own overflow-y-auto on an inner pane, both assume a
          genuinely bounded height cascades down from here. min-h-full only
          sets a floor, so body (and everything under it) grew taller than
          the viewport instead of clipping/scrolling internally. */}
      <body className="h-full flex flex-col bg-white text-zinc-900">{children}</body>
    </html>
  );
}
