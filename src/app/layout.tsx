import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reel",
  description: "AI-native film pre-production: script to budget, trustworthy and sourced.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-zinc-900">{children}</body>
    </html>
  );
}
