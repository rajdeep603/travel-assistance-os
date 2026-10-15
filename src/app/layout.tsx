import type { Metadata } from "next";
import localFont from "next/font/local";
import { BRAND, POWERED_BY } from "@/lib/brand";
import { PRESENT_STORAGE_KEY } from "@/lib/present-mode";
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

// Presentation mode is a per-browser setting; applying it before the first
// paint keeps pages from rendering small and then jumping to the larger size.
const presentModeScript = `try{if(localStorage.getItem(${JSON.stringify(PRESENT_STORAGE_KEY)})==="on")document.documentElement.dataset.present="on"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: presentModeScript }} />
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
