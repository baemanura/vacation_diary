import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://vacation-diary.vercel.app"),
  title: "3기 2제 실시간 연가표",
  description: "충남청 3기동대 2제대 연병가 현황 실시간 관리표",
  openGraph: {
    title: "3기 2제 실시간 연가표",
    description: "충남청 3기동대 2제대 연병가 현황 실시간 관리표",
    siteName: "3기 2제 실시간 연가표",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "3기 2제 실시간 연가표",
    description: "충남청 3기동대 2제대 연병가 현황 실시간 관리표",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
