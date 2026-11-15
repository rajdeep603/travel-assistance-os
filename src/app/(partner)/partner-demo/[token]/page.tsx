import type { Metadata } from "next";
import { PortalApp } from "@/components/partner-demo/portal-app";

export const metadata: Metadata = {
  title: "Gizli demo · CareTrail",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** A partner's private demo portal; the token in the link is the credential. */
export default function PartnerDemoPage({ params }: { params: { token: string } }) {
  return <PortalApp token={params.token} />;
}
