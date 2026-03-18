import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";

export const metadata: Metadata = {
  title: "Video Brand Generator",
  description: "Generate brand-consistent videos powered by Runway Gen-4 Turbo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-tt-bg text-tt-text antialiased">
        <div className="flex min-h-screen">
          {/* Fixed left sidebar */}
          <Sidebar />
          {/* Main content — offset by sidebar width */}
          <main className="ml-[240px] flex min-h-screen flex-1 flex-col">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
