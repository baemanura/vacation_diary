'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, AlertTriangle } from 'lucide-react';

const COLLAPSE_KEY = 'admin_guide_collapsed';

/**
 * 서무가 바뀌어도 이 페이지만 보면 인수인계 없이 운영할 수 있도록 정리한 안내문.
 * 처음 들어온 사람에게는 펼쳐진 상태로 보이고, 접어두면 그 선택을 기억한다.
 */
export default function AdminGuide() {
  // 이 컴포넌트는 관리 페이지가 로딩을 끝낸 뒤에만 렌더되므로 서버에서는 그려지지 않는다.
  // 덕분에 초기값에서 바로 localStorage를 읽어도 하이드레이션이 어긋나지 않는다.
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(COLLAPSE_KEY) !== '1';
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? '0' : '1');
      return next;
    });
  };

  return (
    <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-gray-50 transition"
      >
        <span className="flex items-center gap-2 font-semibold text-gray-900">
          <BookOpen size={18} className="text-blue-600 shrink-0" />
          서무 사용 안내
        </span>
        {open ? (
          <ChevronUp size={18} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-6 pb-6 pt-2 border-t border-gray-200 space-y-6 text-sm text-gray-700">
          <Section title="이 페이지에서 하는 일">
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <B>정원 설정</B> — 출동율에 따라 하루에 몇 명까지 연가를 보낼 수 있는지 정합니다.
              </li>
              <li>
                <B>계정 관리</B> — 새로 전입한 대원의 계정을 만듭니다.
              </li>
              <li>
                <B>대원 목록</B> — 이름·계급·역할 수정, 비밀번호 초기화, 삭제를 합니다.
              </li>
            </ul>
            <p className="mt-2">
              연가 신청·취소·순번 지정은 이 페이지가 아니라 <B>대시보드의 달력</B>에서 합니다.
            </p>
          </Section>

          <Section title="새 대원이 전입했을 때">
            <ol className="space-y-1 list-decimal list-inside">
              <li>
                <B>계정 관리</B> 탭에서 이름과 계급을 입력하고 [계정 생성]을 누릅니다.
              </li>
              <li>
                화면에 <B>초기 비밀번호</B>(<Code>knp123</Code>)가 표시됩니다. 이 값을 본인에게
                전달하세요.
              </li>
              <li>
                그 대원이 <B>이름 + 계급</B>(예: <Code>홍길동 경사</Code>)과 초기 비밀번호로
                로그인하면, 본인 비밀번호로 바꾸는 화면이 먼저 나옵니다. 바꾸기 전에는 연가표를
                볼 수 없습니다.
              </li>
            </ol>
            <Callout tone="warn">
              초기 비밀번호 <Code>knp123</Code>은 <B>모두가 아는 값</B>입니다. 본인이 첫 로그인을
              하기 전까지는 다른 사람이 먼저 접속할 수 있으니, 전달하면서{' '}
              <B>바로 접속해 비밀번호를 바꾸도록</B> 안내해주세요.
            </Callout>
          </Section>

          <Section title="대원 목록의 버튼 세 개">
            <ul className="space-y-2">
              <li>
                <Badge className="bg-blue-100 text-blue-700">✏️ 파랑</Badge> 이름·계급·역할을
                수정합니다. [저장]을 눌러야 반영됩니다.
              </li>
              <li>
                <Badge className="bg-amber-100 text-amber-700">🔑 주황</Badge> 비밀번호를
                초기화합니다. 비밀번호를 잊은 대원에게 사용하세요. 새 임시 비밀번호가 한 번만
                표시되고, 본인이 다시 바꾸게 됩니다.
              </li>
              <li>
                <Badge className="bg-red-100 text-red-700">🗑️ 빨강</Badge> 대원을 삭제합니다.
                <B>전출자만 지우세요.</B> 그 대원의 계정과 함께 <B>연가 기록·게시글·댓글이 모두
                삭제</B>되고, 되돌릴 수 없습니다. 무엇이 지워지는지 누르면 먼저 보여줍니다.
              </li>
            </ul>
            <Callout tone="warn">
              <B>대원 삭제는 되돌릴 수 없습니다.</B> 이 연가표는 <B>지금 근무 중인 대원만</B>{' '}
              관리합니다. 그래서 전출자를 지우면 그 사람의 지난 기록도 함께 없어지고, 지난달
              달력에서도 그 사람 신청이 보이지 않게 됩니다. <B>휴직·파견처럼 돌아올 사람은 지우지
              마세요.</B>
            </Callout>
            <Callout tone="warn">
              <B>이름과 계급은 로그인 아이디입니다.</B> 이미 있는 사람과 이름·계급이 모두 같아지면
              두 사람 다 로그인할 수 없게 되므로, 그런 저장은 자동으로 거부됩니다. 동명이인이라면
              계급이 같아지지 않도록 하거나 이름을 구분해 적어주세요.
            </Callout>
            <Callout tone="warn">
              <B>서무는 최소 한 명이 있어야 합니다.</B> 혼자만 서무일 때 자신을 일반 대원으로
              바꾸거나 삭제하면 아무도 이 페이지에 들어올 수 없게 되므로 막아둡니다. 서무를
              넘길 때는 <B>새 서무를 먼저 지정한 뒤</B> 본인을 일반으로 바꾸세요.
            </Callout>
          </Section>

          <Section title="정원 설정하는 법">
            <p>
              출동율을 고르면 인원이 자동으로 정해집니다. <B>70% → 가능 5명</B>,{' '}
              <B>80% → 가능 3명</B>이고, 여기에 만일을 대비한 <B>예비 2명</B>이 더해져 총 한도가
              됩니다.
            </p>
            <p className="mt-2">달력의 날짜 색은 이 기준으로 칠해집니다.</p>
            <ul className="mt-1 space-y-1 list-disc list-inside">
              <li>
                <B className="text-green-700">초록(여유)</B> — 가능인원 이내
              </li>
              <li>
                <B className="text-yellow-700">노랑(주의)</B> — 예비인원까지 쓰는 중
              </li>
              <li>
                <B className="text-red-700">빨강(초과)</B> — 예비인원까지 넘김
              </li>
            </ul>
            <p className="mt-2">
              <B>적용 시작일</B>부터 그 설정이 쓰입니다. <B>적용 종료일</B>을 비워두면 다음 설정을
              넣기 전까지 계속 적용되고, 종료일을 지정하면 그 다음날 <B>이전 출동율로 자동
              복귀</B>합니다. 훈련처럼 한시적으로 바뀌는 기간에 쓰면 편합니다.
            </p>
          </Section>

          <Section title="달력에서 서무가 할 수 있는 일">
            <ul className="space-y-1 list-disc list-inside">
              <li>날짜를 누르면 그 날 신청자 목록이 나옵니다.</li>
              <li>
                각 신청 옆 <B>순번</B>을 골라 1~5순위를 지정할 수 있습니다. 인원이 넘칠 때 누가
                우선인지 표시하는 용도입니다.
              </li>
              <li>
                남의 신청을 취소하면 <B>취소 사유를 반드시 입력</B>해야 하고, 그 사유가 기록에
                남습니다. 본인 신청은 사유 없이 취소됩니다.
              </li>
              <li>
                여러 날짜에 걸친 연가 중 하루만 취소하면, 그 하루만 취소되고 나머지 기간은
                그대로 유지됩니다.
              </li>
            </ul>
          </Section>

          <Section title="게시글을 공지로 올리기">
            <p>
              자유게시판의 글 오른쪽 위 <Badge className="bg-amber-100 text-amber-700">📌 압정</Badge>{' '}
              버튼을 누르면 그 글이 <B>공지</B>가 되어 목록 맨 위에 노란색으로 고정됩니다. 이
              버튼은 서무에게만 보입니다.
            </p>
            <p className="mt-2">
              누른 사람이 아니라 <B>원래 글쓴이가 그대로 유지</B>되고, 내용도 바뀌지 않습니다. 다시
              누르면 공지가 내려갑니다. 공지는 여러 개 올릴 수 있습니다.
            </p>
            <p className="mt-2">
              공지로 지정하면 <B>대시보드 맨 위</B>에도 같이 뜹니다. 대원이 로그인하자마자 보게
              되므로, 꼭 읽어야 하는 내용에만 쓰는 것이 좋습니다. 댓글은 아래 자유게시판의 원래
              글에서 달 수 있습니다.
            </p>
            <p className="mt-2">
              대원은 <B>본인이 쓴 글과 댓글의 내용만</B> 고칠 수 있고(고치면 <Code>수정됨</Code>이
              붙습니다), 공지로 올리는 것은 <B>서무만</B> 할 수 있습니다.
            </p>
          </Section>

          <Section title="신청 유형과 연가 구분">
            <p>
              신청 유형은 <B>연가 · 병가 · 공가 · 특가 · 교육 · 출장 · 휴직</B> 입니다.
            </p>
            <p className="mt-2">
              연가를 고르면 <B>구분</B>을 함께 고르게 되어 있습니다 — <Code>일반</Code>(하루 종일),{' '}
              <Code>오전</Code>, <Code>오후</Code>. 반일만 쓰는 경우를 구분하기 위한 것입니다.
            </p>
            <Callout tone="warn">
              여행·결혼식 같은 <B>구체적인 사정은 목록에서 고르지 않고</B>, 대원이 신청 화면의{' '}
              <B>추가 사항</B> 칸에 직접 적습니다. 적지 않아도 신청은 됩니다.
            </Callout>
          </Section>

          <Section title="대원에게 안내할 것 — 홈 화면에 앱처럼 추가하기">
            <p>
              카카오톡으로 링크를 받아 매번 들어오는 대신, <B>휴대폰 홈 화면에 아이콘</B>을 만들어
              두면 바로 들어올 수 있습니다. 대시보드 맨 위에 기기에 맞는 안내가 자동으로 뜹니다.
            </p>
            <Callout tone="warn">
              <B>카카오톡 안에서는 홈 화면 추가가 되지 않습니다.</B> 반드시 크롬이나 Safari로 한 번
              옮겨서 추가해야 합니다. 카카오톡 화면 오른쪽 아래 <B>⋯</B> →{' '}
              <B>다른 브라우저로 열기</B>를 누르면 됩니다. 이 과정은 <B>한 번만</B> 하면 됩니다.
            </Callout>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>
                <B>안드로이드</B> — 크롬으로 열면 [홈 화면에 추가] 버튼이 바로 나옵니다.
              </li>
              <li>
                <B>아이폰</B> — Safari 아래쪽 공유 버튼 → <B>홈 화면에 추가</B> → <B>추가</B>.
              </li>
            </ul>
          </Section>

        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function B({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <strong className={`font-semibold text-gray-900 ${className}`}>{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1 py-0.5 rounded bg-gray-100 text-gray-800 text-xs font-mono">
      {children}
    </code>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-1 ${className}`}>
      {children}
    </span>
  );
}

function Callout({ children, tone }: { children: React.ReactNode; tone: 'warn' }) {
  return (
    <div
      className={`mt-2 flex gap-2 rounded-lg px-3 py-2 text-sm ${
        tone === 'warn'
          ? 'bg-amber-50 border border-amber-200 text-amber-900'
          : 'bg-blue-50 border border-blue-200 text-blue-900'
      }`}
    >
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
