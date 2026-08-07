import type { MetadataRoute } from 'next';

// 홈 화면에 추가했을 때 주소창 없이 앱처럼 열리게 하는 설정이다.
// 카카오톡 인앱 브라우저에서는 "홈 화면에 추가"가 동작하지 않으므로,
// 크롬/사파리로 한 번 열어서 추가해야 한다 (안내는 components/InstallGuide.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '3기 2제 실시간 연가표',
    short_name: '연가표',
    description: '충남청 3기동대 2제대 연병가 현황 실시간 관리표',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f9fafb',
    theme_color: '#3b82f6',
    lang: 'ko-KR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // 안드로이드가 기기 모양대로 잘라내는 용도. 여백이 넉넉한 별도 도안을 쓴다.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
