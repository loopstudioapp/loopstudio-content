import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loop Studio",
  description: "Content creator management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] antialiased">
        {children}
      </body>
    </html>
  );
}
