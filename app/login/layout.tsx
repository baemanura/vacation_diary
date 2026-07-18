import type { Viewport } from "next";

// 로그인 화면은 입력창 포커스 시 iOS/인앱 브라우저가 자동으로 확대했다가
// 원래 배율로 돌아오지 않는 문제가 있어, 이 라우트에서만 확대를 고정한다.
// 로그인 이후 화면은 루트 레이아웃의 기본값을 따라 자유롭게 확대할 수 있다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
