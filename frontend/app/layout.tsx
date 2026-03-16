import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Brand Generator",
  description: "Generate brand-consistent videos powered by Google Veo 3.1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
