import type { Metadata } from "next";
import { AuditLog } from "@/components/AuditLog";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Live Audit Log · fraud.auth",
  description:
    "Every standing order check, receipt scan, refund QR and merchant verification, recorded as it happens.",
};

export default function AuditLogPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 flex-col">
        <AuditLog page />
      </main>
      <Footer />
    </>
  );
}
