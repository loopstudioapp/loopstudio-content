import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GrailScan",
};

export default function GrailScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
