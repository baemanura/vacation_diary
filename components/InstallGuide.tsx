'use client';

import { useEffect, useState } from 'react';
import { Share, MoreVertical, X, Smartphone } from 'lucide-react';

// 안드로이드 크롬이 "설치할 수 있다"고 알려줄 때 넘겨주는 이벤트.
// 표준 타입 정의에 아직 없어서 필요한 부분만 직접 적는다.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'install_guide_dismissed';

type Env = 'kakao-android' | 'kakao-ios' | 'ios' | 'android' | 'other';

function detectEnv(): Env {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  // 카카오톡 인앱 브라우저는 UA에 KAKAOTALK을 붙인다.
  const isKakao = /KAKAOTALK/i.test(ua);

  if (isKakao) return isIOS ? 'kakao-ios' : 'kakao-android';
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'other';
}

// 이미 홈 화면 앱으로 실행 중이면 안내할 필요가 없다.
function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS 사파리는 표준 display-mode 대신 이 값을 쓴다.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function InstallGuide() {
  // 이 컴포넌트는 대시보드가 로딩을 끝낸 뒤에만 렌더되므로 서버에서는 그려지지 않는다.
  // 덕분에 초기값에서 바로 navigator/localStorage를 읽어도 하이드레이션이 어긋나지 않는다.
  // (AdminGuide도 같은 방식이다.)
  const [env, setEnv] = useState<Env | null>(() => {
    if (typeof window === 'undefined') return null;
    if (isInstalled() || localStorage.getItem(DISMISS_KEY) === '1') return null;
    return detectEnv();
  });
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // 크롬 자체 배너 대신 우리 [설치] 버튼으로 유도한다.
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setEnv(null);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    setInstallPrompt(null);
  };

  // 카카오톡 안드로이드에서는 크롬으로 다시 열어줄 수 있다.
  // (인앱 브라우저에서는 홈 화면 추가 자체가 불가능하다.)
  const openInChrome = () => {
    const { host, pathname, search } = window.location;
    window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  if (!env) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Smartphone className="text-blue-600 shrink-0 mt-0.5" size={20} />
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">
              홈 화면에 추가하면 카톡 없이 바로 들어올 수 있어요
            </h3>

            {env === 'kakao-android' && (
              <>
                <p className="text-sm text-gray-700 mt-1">
                  카카오톡 안에서는 추가할 수 없습니다. 크롬으로 한 번만 옮겨서 추가하면 됩니다.
                </p>
                <button
                  onClick={openInChrome}
                  className="mt-3 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  크롬으로 열기
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  버튼이 동작하지 않으면 오른쪽 아래 <B>⋯</B> → <B>다른 브라우저로 열기</B>
                </p>
              </>
            )}

            {env === 'kakao-ios' && (
              <>
                <p className="text-sm text-gray-700 mt-1">
                  카카오톡 안에서는 추가할 수 없습니다. 아래 순서로 한 번만 하면 됩니다.
                </p>
                <ol className="text-sm text-gray-700 mt-2 space-y-1 list-decimal list-inside">
                  <li>
                    오른쪽 아래 <B>⋯</B> → <B>다른 브라우저로 열기</B> (Safari)
                  </li>
                  <li>
                    Safari 아래쪽 <Share className="inline align-text-bottom" size={14} /> 공유
                    버튼을 누릅니다.
                  </li>
                  <li>
                    <B>홈 화면에 추가</B>를 선택합니다.
                  </li>
                </ol>
              </>
            )}

            {env === 'ios' && (
              <ol className="text-sm text-gray-700 mt-2 space-y-1 list-decimal list-inside">
                <li>
                  아래쪽 <Share className="inline align-text-bottom" size={14} /> 공유 버튼을
                  누릅니다.
                </li>
                <li>
                  목록에서 <B>홈 화면에 추가</B>를 선택합니다.
                </li>
                <li>
                  오른쪽 위 <B>추가</B>를 누르면 끝입니다.
                </li>
              </ol>
            )}

            {env === 'android' &&
              (installPrompt ? (
                <>
                  <p className="text-sm text-gray-700 mt-1">
                    버튼 한 번이면 홈 화면에 아이콘이 생깁니다.
                  </p>
                  <button
                    onClick={install}
                    className="mt-3 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                  >
                    홈 화면에 추가
                  </button>
                </>
              ) : (
                <ol className="text-sm text-gray-700 mt-2 space-y-1 list-decimal list-inside">
                  <li>
                    오른쪽 위 <MoreVertical className="inline align-text-bottom" size={14} /> 메뉴를
                    누릅니다.
                  </li>
                  <li>
                    <B>홈 화면에 추가</B>를 선택합니다.
                  </li>
                </ol>
              ))}

            {env === 'other' && (
              <p className="text-sm text-gray-700 mt-1">
                휴대폰 브라우저(크롬·Safari)에서 이 화면을 열면 홈 화면에 추가할 수 있습니다.
              </p>
            )}
          </div>
        </div>

        <button
          onClick={dismiss}
          className="shrink-0 p-1 text-gray-400 hover:text-gray-600 hover:bg-blue-100 rounded transition"
          title="다시 보지 않기"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-gray-900">{children}</span>;
}
