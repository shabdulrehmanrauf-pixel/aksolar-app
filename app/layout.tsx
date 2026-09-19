import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "AK Solar", template: "%s | AK Solar" },
  description: "Stock, customers and invoices for Al Karam Battery and Solar.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1c2b33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="bg-plate font-sans text-casing antialiased">
        {children}
      </body>
    </html>
  );
}
