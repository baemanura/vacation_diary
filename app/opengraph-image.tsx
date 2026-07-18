import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const [bold, regular] = await Promise.all([
    readFile(join(process.cwd(), 'public/fonts/NotoSansKR-Bold.woff')),
    readFile(join(process.cwd(), 'public/fonts/NotoSansKR-Regular.woff')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 110, marginBottom: 8 }}>📅</div>
        <div
          style={{
            display: 'flex',
            fontSize: 68,
            fontWeight: 700,
            color: '#ffffff',
            fontFamily: 'Noto Sans KR',
          }}
        >
          3기 2제 실시간 연가표
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            marginTop: 20,
            color: 'rgba(255,255,255,0.85)',
            fontFamily: 'Noto Sans KR',
          }}
        >
          연가 · 병가 신청 및 현황 관리
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Noto Sans KR', data: bold, weight: 700, style: 'normal' },
        { name: 'Noto Sans KR', data: regular, weight: 400, style: 'normal' },
      ],
    }
  );
}
