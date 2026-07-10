import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EGOS — Kariyer Koçun",
  description:
    "Yapay zekâ destekli kariyer gelişim koçu: kanıta dayalı yetkinlik haritası ve kişisel gelişim planı.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
