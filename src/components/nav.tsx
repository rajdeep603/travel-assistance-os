"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  FolderKanban,
  Home,
  MessageSquareText,
  Mic,
  ReceiptText,
  Stethoscope,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/documents", label: "Medical Document AI", icon: FileText },
  { href: "/cases", label: "AI Case Manager", icon: FolderKanban },
  { href: "/claims", label: "Claims Automation", icon: ReceiptText },
  { href: "/providers", label: "Provider Search", icon: Stethoscope },
  { href: "/assistant", label: "Internal AI Assistant", icon: MessageSquareText },
  { href: "/voice", label: "Voice Agent", icon: Mic },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
