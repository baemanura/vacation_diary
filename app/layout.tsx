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
  // 홈 화면에 추가했을 때 iOS에서도 주소창 없이 앱처럼 열리게 한다.
  appleWebApp: {
    capable: true,
    title: "연가표",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 홈 화면 앱으로 열었을 때 상단 상태표시줄 색을 달력 파란색에 맞춘다.
  themeColor: "#3b82f6",
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
