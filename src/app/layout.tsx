import type { Metadata } from "next";
import localFont from "next/font/local";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { PRESENT_STORAGE_KEY } from "@/lib/present-mode";
import { SIDEBAR_STORAGE_KEY } from "@/lib/sidebar";
import { MotionProvider } from "@/components/motion-provider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: `${BRAND.name}: ${BRAND.tagline}. ${POWERED_BY}.`,
};

// Presentation mode and a hidden sidebar are per-browser settings; applying
// them before the first paint keeps pages from rendering one way and then jumping.
const displayScript = `try{var d=document.documentElement;if(localStorage.getItem(${JSON.stringify(PRESENT_STORAGE_KEY)})==="on")d.dataset.present="on";if(localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)})==="hidden")d.dataset.sidebar="hidden"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: displayScript }} />
      </head>
      <body className={`${geistSans.variable} font-sans`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
