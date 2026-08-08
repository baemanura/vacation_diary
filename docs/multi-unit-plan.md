# 1·2·3제대 통합 운영 준비 계획

> **상태: 준비만 해둔 것. 아직 아무것도 적용하지 않았다.**
> 실제로 세 제대가 함께 쓰기로 결정되면 이 문서대로 진행하면 된다.
> 작성 2026-08-08.

## 확정된 요구사항

1. **로그인 화면에서 제대를 고른다** — `1제대 / 2제대 / 3제대`
2. 로그인하면 **자기 제대 것만 보인다**. 다른 제대는 존재조차 안 보인다
3. **통합 관리자**는 모든 제대를 볼 수 있다. **보기만 가능하고 고칠 수 없다**
4. 각 제대는 지금처럼 **제대 서무가 각자 관리**한다
5. **자유게시판도 제대별로 분리**한다
6. 다만 **전 제대 공지**는 가능해야 한다 — 통합 관리자가 세 제대 모두에게 띄우는 글
7. 통합 관리자 계정은 **새로 만든다**

> 6번 때문에 통합 관리자가 **유일하게 쓸 수 있는 것이 전 제대 공지 하나**가 된다.
> 그 외에는 여전히 아무것도 고치지 못한다. 이 예외는 DB 권한을 열어서가 아니라
> **서버 경로 하나로만** 열어둔다(아래 "전 제대 공지" 참고).

## 왜 배포를 나누지 않는가

제대마다 별도 주소·별도 데이터베이스로 띄우면 격리는 가장 확실하지만,
**통합 관리자가 전 제대를 볼 방법이 없다.** 요구사항 3 때문에 한 앱에서 제대를
구분하는 방식이어야 한다.

## 핵심 원칙 — 걸러내는 일은 DB가 한다

앱 코드 47곳에 "내 제대만" 조건을 붙이는 방식은 **한 곳만 빠뜨려도 다른 제대 데이터가
새어나간다.** 대신 **권한 규칙(RLS)에 제대 조건을 넣는다.** 그러면 앱이 지금처럼 조회해도
데이터베이스가 자기 제대 것만 돌려준다.

- 격리가 코드가 아니라 DB에서 보장된다
- 실수하면 **데이터가 안 보이는 쪽**으로 실패한다 (반대 방향보다 훨씬 안전하다)
- 달력·신청·게시판 화면은 **고칠 필요가 없다**

---

## 데이터 구조

### 표에 추가할 칸

| 표 | 추가 | 비고 |
|---|---|---|
| `profiles` | `unit text NOT NULL` | 이 사람이 어느 제대인지 |
| `quota_settings` | `unit text NOT NULL` | 제대마다 출동율·정원이 다르다 |
| `leave_requests` | `unit text NOT NULL` | 아래 "왜 칸을 두는가" 참고 |
| `board_posts` | `unit text NOT NULL` | 〃 |
| `board_comments` | `unit text NOT NULL` | 〃 |
| `date_comments` | `unit text NOT NULL` | 〃 |
| `leave_priorities` | `unit text NOT NULL` | 〃 |

기존 데이터는 전부 `2제대`가 된다. **지금 쓰던 것은 그대로 유지된다.**

### 왜 기록에도 제대 칸을 두는가

작성자의 `profiles`를 따라가면 칸 없이도 제대를 알 수 있다. 그런데 그러면
권한 규칙마다 다른 표를 뒤져야 해서 느리고, **통합 관리자가 "2제대만 보기"를 할 때
쓸 조건이 없다.** 칸을 두면 규칙이 `unit = 내 제대` 한 줄로 끝난다.

값이 어긋날 걱정은 **트리거로 없앤다** — 저장할 때 작성자의 제대를 DB가 직접 채운다.

> ⚠️ **트리거만으로는 부족하다.** 트리거는 값이 비어 있을 때만 채운다. 앱이 `unit`을 직접
> 지정해 보내면 트리거는 건너뛴다. 그래서 **저장 규칙(INSERT 정책)에도
> `unit = my_unit()` 조건을 반드시 넣는다.** 이게 빠지면 마음먹은 사람이 `3제대`라고 적어
> 다른 제대에 글을 꽂을 수 있다. 아래 4단계 정책에 모두 반영돼 있다.

사람이 제대를 옮기면 **지난 기록은 예전 제대로 남는다.** 그때 그 제대에서 쓴 연가가
맞으므로 이게 옳다.

### 역할(role)

| 값 | 뜻 | 권한 |
|---|---|---|
| `member` | 대원 | 자기 제대 조회, 본인 신청·글 |
| `admin` | 제대 서무 | 자기 제대 전체 관리 (지금과 동일) |
| `super` | **통합 관리자** | **모든 제대 조회. 쓰기 전부 불가** |

---

## 0단계 · 지금 정책부터 확인 (먼저 실행)

권한 규칙을 새로 쓰려면 **지금 무엇이 걸려 있는지 먼저 봐야 한다.**
`service_role` 키로는 조회가 안 되므로 SQL Editor에서 직접 실행한다.

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
```

**결과를 그대로 저장해둘 것.** 두 가지 용도다.
1. 아래 SQL이 빠뜨린 정책이 있는지 대조
2. 문제가 생겼을 때 되돌릴 원본

---

## 실행 SQL

> 0단계 결과를 확인한 뒤에 순서대로 실행한다.
> `DROP`이 들어가 Supabase가 경고창을 띄우지만, 대상은 아래 7개 표의 정책뿐이다.

### 1단계 · 칸 추가와 기존 데이터 채우기

```sql
ALTER TABLE profiles         ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '2제대';
ALTER TABLE quota_settings   ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '2제대';

ALTER TABLE leave_requests   ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE board_posts      ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE board_comments   ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE date_comments    ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE leave_priorities ADD COLUMN IF NOT EXISTS unit text;

UPDATE leave_requests   SET unit = '2제대' WHERE unit IS NULL;
UPDATE board_posts      SET unit = '2제대' WHERE unit IS NULL;
UPDATE board_comments   SET unit = '2제대' WHERE unit IS NULL;
UPDATE date_comments    SET unit = '2제대' WHERE unit IS NULL;
UPDATE leave_priorities SET unit = '2제대' WHERE unit IS NULL;

ALTER TABLE leave_requests   ALTER COLUMN unit SET NOT NULL;
ALTER TABLE board_posts      ALTER COLUMN unit SET NOT NULL;
ALTER TABLE board_comments   ALTER COLUMN unit SET NOT NULL;
ALTER TABLE date_comments    ALTER COLUMN unit SET NOT NULL;
ALTER TABLE leave_priorities ALTER COLUMN unit SET NOT NULL;
```

### 2단계 · 저장할 때 제대를 자동으로 채우는 트리거

```sql
CREATE OR REPLACE FUNCTION set_row_unit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid;
BEGIN
  IF NEW.unit IS NULL THEN
    owner_id := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
    SELECT p.unit INTO NEW.unit FROM profiles p WHERE p.id = owner_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_unit ON leave_requests;
CREATE TRIGGER trg_unit BEFORE INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_row_unit('member_id');

DROP TRIGGER IF EXISTS trg_unit ON board_posts;
CREATE TRIGGER trg_unit BEFORE INSERT ON board_posts
  FOR EACH ROW EXECUTE FUNCTION set_row_unit('author_id');

DROP TRIGGER IF EXISTS trg_unit ON board_comments;
CREATE TRIGGER trg_unit BEFORE INSERT ON board_comments
  FOR EACH ROW EXECUTE FUNCTION set_row_unit('author_id');

DROP TRIGGER IF EXISTS trg_unit ON date_comments;
CREATE TRIGGER trg_unit BEFORE INSERT ON date_comments
  FOR EACH ROW EXECUTE FUNCTION set_row_unit('author_id');

DROP TRIGGER IF EXISTS trg_unit ON leave_priorities;
CREATE TRIGGER trg_unit BEFORE INSERT ON leave_priorities
  FOR EACH ROW EXECUTE FUNCTION set_row_unit('member_id');
```

### 3단계 · 도우미 함수

```sql
-- SECURITY DEFINER가 중요하다. 이게 없으면 profiles 정책이 다시 profiles를 조회하면서
-- 무한 반복에 빠진다(Supabase에서 흔히 겪는 함정).
CREATE OR REPLACE FUNCTION my_unit() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION my_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;
```

### 4단계 · 정책 전면 재작성

```sql
-- 7개 표의 기존 정책을 모두 지우고 아래 정의로 갈아끼운다.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename IN ('profiles','leave_requests','board_posts',
                               'board_comments','date_comments',
                               'leave_priorities','quota_settings')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 조회 규칙: 내 제대이거나, 내가 통합 관리자이거나
-- profiles
CREATE POLICY sel ON profiles FOR SELECT TO authenticated
  USING (unit = my_unit() OR my_role() = 'super');
-- 대원 정보의 추가·수정·삭제는 전부 서버(API)를 거치므로 클라이언트 정책을 두지 않는다.

-- leave_requests
CREATE POLICY sel ON leave_requests FOR SELECT TO authenticated
  USING (unit = my_unit() OR my_role() = 'super');
CREATE POLICY ins ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (member_id = auth.uid() AND unit = my_unit());
CREATE POLICY upd ON leave_requests FOR UPDATE TO authenticated
  USING (member_id = auth.uid() OR (my_role() = 'admin' AND unit = my_unit()))
  WITH CHECK (member_id = auth.uid() OR (my_role() = 'admin' AND unit = my_unit()));

-- board_posts
--  · 공지 지정과 전 제대 공지는 서버 전용이라 여기에 없다.
--  · '전체'로 표시된 글은 모든 제대에 보인다. 대원은 자기 제대 글만 쓸 수 있으므로
--    저장 규칙의 unit = my_unit() 조건이 '전체' 글을 스스로 만드는 것을 막는다.
CREATE POLICY sel ON board_posts FOR SELECT TO authenticated
  USING (unit = my_unit() OR unit = '전체' OR my_role() = 'super');
CREATE POLICY ins ON board_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND unit = my_unit());
CREATE POLICY upd ON board_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY del ON board_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- board_comments
CREATE POLICY sel ON board_comments FOR SELECT TO authenticated
  USING (unit = my_unit() OR my_role() = 'super');
CREATE POLICY ins ON board_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND unit = my_unit());
CREATE POLICY upd ON board_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY del ON board_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- date_comments (서무는 자기 제대의 남의 댓글도 지울 수 있다)
CREATE POLICY sel ON date_comments FOR SELECT TO authenticated
  USING (unit = my_unit() OR my_role() = 'super');
CREATE POLICY ins ON date_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND unit = my_unit());
CREATE POLICY del ON date_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR (my_role() = 'admin' AND unit = my_unit()));

-- leave_priorities (서무 전용)
CREATE POLICY sel ON leave_priorities FOR SELECT TO authenticated
  USING (unit = my_unit() OR my_role() = 'super');
CREATE POLICY ins ON leave_priorities FOR INSERT TO authenticated
  WITH CHECK (my_role() = 'admin' AND set_by = auth.uid() AND unit = my_unit());
CREATE POLICY upd ON leave_priorities FOR UPDATE TO authenticated
  USING (my_role() = 'admin' AND unit = my_unit())
  WITH CHECK (my_role() = 'admin' AND unit = my_unit());
CREATE POLICY del ON leave_priorities FOR DELETE TO authenticated
  USING (my_role() = 'admin' AND unit = my_unit());

-- quota_settings (서무 전용)
CREATE POLICY sel ON quota_settings FOR SELECT TO authenticated
  USING (unit = my_unit() OR my_role() = 'super');
CREATE POLICY ins ON quota_settings FOR INSERT TO authenticated
  WITH CHECK (my_role() = 'admin' AND unit = my_unit());
CREATE POLICY upd ON quota_settings FOR UPDATE TO authenticated
  USING (my_role() = 'admin' AND unit = my_unit())
  WITH CHECK (my_role() = 'admin' AND unit = my_unit());
CREATE POLICY del ON quota_settings FOR DELETE TO authenticated
  USING (my_role() = 'admin' AND unit = my_unit());
```

### 5단계 · 칸 단위 권한 다시 적용

정책을 갈아끼워도 칸 단위 권한은 남지만, 확실히 하기 위해 다시 선언한다.
(대원이 자기 글의 `content`만 고치고 `is_notice`는 못 건드리게 하는 장치다.)

```sql
REVOKE UPDATE ON board_posts    FROM authenticated;
REVOKE UPDATE ON board_comments FROM authenticated;
GRANT  UPDATE (content, updated_at) ON board_posts    TO authenticated;
GRANT  UPDATE (content, updated_at) ON board_comments TO authenticated;
```

### 6단계 · 통합 관리자 계정

화면에서는 만들 수 없다(제대 서무는 자기 제대 계정만 만든다). 만들 때 알려주면
`service_role`로 생성한다. 로그인할 때 고를 제대가 필요하므로 **소속 제대를 하나 정해둔다**
(예: `2제대`). 역할이 `super`라 실제로는 모든 제대가 보인다.

---

## 전 제대 공지

세 제대 모두에게 띄우는 글. `board_posts.unit` 에 제대 대신 **`'전체'`** 를 넣어 표시한다.

### 왜 이 방식인가

- 표를 따로 만들지 않으므로 게시판 화면을 그대로 쓴다
- 조회 규칙이 `unit = 내 제대 **또는** unit = '전체'` 한 줄로 끝난다
- 대원과 제대 서무는 저장 규칙(`unit = my_unit()`)에 막혀 **스스로 '전체' 글을 만들 수 없다**

### 누가 쓰는가

통합 관리자만 쓴다. 그런데 통합 관리자는 DB 권한이 **읽기 전용**이다. 그래서 이 글만
**서버 경로로 쓴다** — 지금 공지 지정(`/api/admin/toggle-notice`)이 쓰는 방식과 같다.

```
POST /api/admin/global-notice   (신규)
  · 요청자가 role = 'super' 인지 서버가 확인
  · service_role 로 board_posts 에 unit = '전체' 로 저장
  · is_notice = true 로 함께 저장 (전 제대에 알릴 글이니 항상 맨 위에 둔다)
  · 수정·삭제도 같은 경로로 (본인이 쓴 전체 공지만)
```

**통합 관리자의 DB 권한은 그대로 읽기 전용**이고, 예외는 이 경로 하나뿐이다.
제대 서무는 전 제대 공지를 내리거나 지울 수 없다(자기 제대 글만 만질 수 있다).

### 화면

- 대시보드 맨 위 공지 영역과 게시판 목록 양쪽에 **모든 제대에서** 보인다
- 제대 공지와 구분되게 **`전체 공지`** 배지를 다른 색으로 붙인다
- 통합 관리자 화면에 `전 제대 공지 작성` 버튼을 둔다

### 댓글은 달 수 없게 한다

전 제대 공지에 댓글을 허용하면 문제가 생긴다. 1제대 대원이 단 댓글은 `unit = 1제대`가
되어 **2·3제대에는 안 보인다.** 같은 글 아래 제대마다 다른 댓글이 달린 것처럼 보인다.
그렇다고 댓글까지 '전체'로 만들면 **게시판을 제대별로 나눈 취지가 깨진다**(1제대 대원이
쓴 글을 3제대가 보게 된다).

그래서 **전 제대 공지에는 댓글 입력칸을 두지 않는다.** 위에서 내려오는 알림이지 토론
게시물이 아니다. 필요하면 각 제대 게시판에서 따로 이야기하면 된다.

---

## 코드 변경 목록

### 반드시 고쳐야 하는 것

| 파일 | 내용 |
|---|---|
| `app/login/page.tsx` | **제대 선택** 추가 |
| `app/api/auth/login/route.ts` | 이름+계급**+제대**로 사람 찾기 |
| `app/api/admin/create-user/route.ts` | 만드는 서무의 제대를 상속. 이름 중복 검사도 **제대별로** |
| `app/api/admin/update-member/route.ts` | 이름 중복 검사 제대별. 다른 제대 대원 수정 차단 |
| `app/api/admin/delete-member/route.ts` | **다른 제대 대원 삭제 차단** |
| `app/api/admin/reset-password/route.ts` | 다른 제대 대원 차단 |
| `app/api/admin/toggle-notice/route.ts` | 다른 제대 게시글 차단 |
| `components/OnlineUsers.tsx` | 채널 이름을 제대별로 (`online-users-1제대`). **안 고치면 접속자 수가 3개 제대 합계로 뜬다** |
| `components/QuotaSettingsManager.tsx` | 저장할 때 제대 지정 |
| `lib/utils.ts` | `UNITS = ['1제대','2제대','3제대']` 상수 |

### 통합 관리자를 위해 고칠 것

| 파일 | 내용 |
|---|---|
| `app/dashboard/page.tsx` | `super`면 상단에 **제대 전환 드롭다운**, 고른 제대를 아래로 전달 |
| `LeaveCalendar` · `BoardPosts` · `NoticeBanner` · `DateComments` | `viewUnit`을 받으면 그 제대로 걸러 조회 (일반 사용자는 RLS가 알아서 하므로 안 넘기면 됨) |
| 신청 폼 · 취소 · 순번 · 공지 버튼 | `super`에게는 **감추기** (읽기 전용) |
| `app/api/admin/global-notice/route.ts` | **신규.** 전 제대 공지 작성·수정·삭제 (`super` 전용) |
| `BoardPosts` · `NoticeBanner` | `전체 공지` 배지 표시, 전 제대 공지에는 **댓글칸 감추기** |
| `app/admin/page.tsx` | `super`에게는 관리 탭 대신 **전 제대 공지 작성** 화면만 |

### 안 고쳐도 되는 것

달력 표시, 신청 목록, 게시판 목록, 월간 집계 — **권한 규칙이 알아서 걸러주므로 그대로 둔다.**

---

## 검증 계획

배포 전에 로컬에서 임시 계정으로 전부 확인한다. **격리가 뚫리면 사고이므로 이 단계를
건너뛰지 않는다.**

만들 계정: 제대마다 대원 1명 + 서무 1명 (6개) + 통합 관리자 1개.

| # | 확인할 것 | 기대 |
|---|---|---|
| 1 | 1제대 대원이 2제대 **연가**를 조회 | 안 보임 |
| 2 | 1제대 대원이 2제대 **게시글·댓글**을 조회 | 안 보임 |
| 3 | 1제대 대원이 2제대 **대원 목록**을 조회 | 안 보임 |
| 4 | 1제대 대원이 2제대 **정원 설정**을 조회 | 안 보임 |
| 5 | 1제대 **서무**가 2제대 대원을 삭제·수정 | 거부 |
| 6 | 1제대 **서무**가 2제대 날짜에 순번 지정 | 거부 |
| 7 | 1제대 서무가 **자기 제대**는 지금처럼 전부 관리 | 정상 |
| 8 | **통합 관리자**가 세 제대를 모두 조회 | 전부 보임 |
| 9 | **통합 관리자**가 신청·취소·삭제·공지·정원 변경 시도 | **전부 거부** |
| 10 | 같은 `홍길동 경사`가 1제대와 2제대에 각각 있을 때 로그인 | 각자 정상 로그인 |
| 11 | 신규 신청·글 작성 시 제대가 자동으로 채워지는지 | 작성자 제대와 일치 |
| 12 | 대원이 `unit`을 **직접 지정해** 다른 제대에 글·신청을 꽂으려 시도 | **거부** (저장 규칙) |
| 13 | 대원이 `unit = '전체'`로 글을 만들려 시도 | **거부** |
| 14 | 통합 관리자가 쓴 **전 제대 공지**가 세 제대 모두에 보이는지 | 전부 보임 |
| 15 | 제대 서무가 전 제대 공지를 수정·삭제 시도 | 거부 |
| 16 | 기존 2제대 데이터가 그대로인지 | 26명·기록 유지 |

12·13번이 이번에 추가된 항목이다. 트리거는 값이 **비어 있을 때만** 채우므로,
앱이 제대를 직접 적어 보내면 트리거를 지나친다. 막는 것은 저장 규칙의
`unit = my_unit()` 조건이고, 그게 실제로 동작하는지 확인하는 검사다.

10번이 중요하다 — **제대를 합치면 동명이인이 생길 수 있고**, 지금 구조는 이름+계급이
겹치면 로그인을 막는다.

---

## 배포 순서

1. 0단계 정책 조회 → 결과 보관
2. 1~5단계 SQL 실행
3. 코드 배포 **전에** 위 검증을 로컬에서 수행
4. 결과 확인 후 배포
5. 배포 후 실제 계정으로 1·8·9번 재확인

### 되돌리기

- **코드**: 이전 커밋으로 되돌리면 됨
- **정책**: 0단계에서 저장한 원본으로 복구
- **칸**: `ALTER TABLE ... DROP COLUMN unit` (기존 데이터는 영향 없음)

칸을 남겨둔 채 코드만 되돌려도 동작한다. 급하면 코드만 되돌리는 것이 가장 빠르다.

---

## 남은 위험과 미결 사항

**위험**
- **정책 재작성이 이 작업의 전부다.** 규칙 하나를 느슨하게 쓰면 다른 제대가 보인다.
  검증 1~4번으로 반드시 막는다.
- `profiles` 조회를 `authenticated` 전용으로 좁힌다. 지금은 로그인 없이도 읽히는데
  로그인 전에 읽을 일이 없으므로 안전한 조임이지만, 배포 후 로그인 화면을 한 번 확인한다.
- 트리거가 `profiles`를 조회하므로 프로필이 없는 상태에서 기록을 만들면 제대가 비어
  실패한다. 정상 흐름에서는 생기지 않는다.

**결정 보류**
- **통합 관리자가 볼 화면.** 지금 계획은 제대를 하나씩 전환해 보는 방식이다.
  세 제대를 한 화면에 겹쳐 보는 요구가 생기면 달력 표시를 따로 설계해야 한다.
- **전 제대 공지에 댓글을 허용할지.** 지금 계획은 막아둔다(위 "전 제대 공지" 참고).
  허용하려면 게시판을 제대별로 나눈 원칙과 충돌하므로 그때 다시 정한다.
- 대원이 제대를 옮길 때의 절차 — 서무가 제대만 바꾸면 되지만, 지난 기록은 예전 제대에
  남는다는 점을 안내에 넣을지.

## 참고

- 지금까지 실제로 실행한 SQL과 삭제 연쇄 관계: `docs/database-changes.md`
- 이 계획은 그 문서의 권한 구조를 **전제로 한다.** 그 사이에 권한을 바꿨다면
  0단계 조회 결과와 대조할 것.
