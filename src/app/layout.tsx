import type { Metadata } from "next";
import localFont from "next/font/local";
import { ShieldCheck } from "lucide-react";
import { MobileNav, SideNav } from "@/components/nav";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Travel Assistance AI Platform",
  description:
    "AI-powered automation for travel assistance and healthcare operations — ITIC Global demonstration platform.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 pb-6 md:flex">
            <div className="px-6 py-6">
              <div className="flex items-center gap-2 text-white">
                <ShieldCheck size={22} className="text-blue-400" aria-hidden />
                <span className="text-sm font-semibold leading-tight">
                  Travel Assistance
                  <br />
                  AI Platform
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-slate-400">
                AI-powered automation for travel assistance and healthcare
                operations
              </p>
            </div>
            <SideNav />
            <div className="mt-auto px-6 pt-6">
              <p className="text-[10px] leading-snug text-slate-500">
                ITIC Global demonstration build.
                <br />
                All data is fictional.
              </p>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 md:px-6 md:py-3">
              <div className="flex items-center gap-2">
                <MobileNav />
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 md:hidden">
                  <ShieldCheck size={17} className="text-blue-600" aria-hidden />
                  Travel Assistance AI
                </p>
              </div>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 md:text-[11px]">
                Demo — fictional data only
              </span>
            </header>
            <main id="main-content" className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6 lg:px-10">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
