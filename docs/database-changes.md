# 데이터베이스 변경 기록

이 저장소의 코드는 git에 남지만, **Supabase의 표 구조와 권한 설정은 git에 남지 않는다.**
전부 Supabase 대시보드의 SQL Editor에서 사람이 직접 실행하기 때문이다.
그래서 실행한 SQL을 여기에 모아둔다.

`.env.local`의 service_role 키로는 표 구조를 바꿀 수 없다(조회·입력·수정만 된다).
새 기능에 표 구조나 권한 변경이 필요하면 **SQL을 사람이 실행한 뒤에 코드를 배포해야 한다.**
순서를 바꾸면 배포된 화면이 아직 없는 칸을 찾다가 깨진다.

---

## 지금의 권한 구조 (2026-08-08 기준)

| 표 | 로그인한 대원이 할 수 있는 것 |
|---|---|
| `leave_requests` | 조회 / 신청 / 취소 (서무는 남의 것도 취소) |
| `board_posts` | 조회 / 작성 / 삭제 / **본인 글의 `content`만 수정** |
| `board_comments` | 조회 / 작성 / 삭제 / **본인 댓글의 `content`만 수정** |
| `date_comments` | 조회 / 작성 / 본인 것 삭제 (서무는 남의 것도 삭제) |
| `leave_priorities` | **서무만** 지정·해제 |
| `quota_settings` | 조회만. **추가·수정·삭제는 서무만** |

- `board_posts.is_notice`(공지)는 **브라우저에서 아무도 바꿀 수 없다.**
  칸 단위 권한으로 막아두고, 서무용 서버 경로 `/api/admin/toggle-notice`에서만 바꾼다.
  Postgres 권한은 역할(role) 단위라서 서무와 대원을 구분하지 못하고, 둘 다 `authenticated`다.
  그래서 "칸을 제한하고, 예외는 서버가 검사한다"는 구조를 쓴다.
- 익명(비로그인) 키로는 **조회만** 되고 쓰기는 RLS가 막는다.

### 주의 — 조용히 실패하는 수정

RLS가 막은 `update`는 오류가 아니라 **"0건 수정 성공"** 으로 돌아온다.
그래서 클라이언트에서 수정할 때는 반드시 `.select()`로 바뀐 행을 받아서
`data.length === 0`을 실패로 처리해야 한다. 그러지 않으면 버튼이 아무 일도 하지 않는데
오류도 안 뜨는 상태가 된다(2026-08-08에 공지 기능에서 실제로 겪음).

---

---

## 사람을 지울 때 무엇이 함께 지워지는가

가장 사고가 나기 쉬운 부분이라 따로 적어둔다. **직접 실험해서 확인한 결과다.**

| 지우는 것 | 결과 |
|---|---|
| `profiles` 행만 | 연가 기록·게시글 **남는다**. 로그인 계정은 남아서 아무도 못 쓰는 껍데기가 된다 |
| **로그인 계정(auth)** | `leave_requests`와 `board_posts`가 **연쇄로 함께 삭제된다** |

즉 "계정만 지우고 기록은 남기기"는 이 구조에서 불가능하다. `member_id`와 `author_id`가
`NOT NULL`이라 기록에서 사람만 떼어낼 수도 없다.

**그래서 2026-08-08에 "전출자는 기록까지 통째로 삭제한다"로 정했다.** 이 연가표는 지금
근무 중인 대원만 관리한다. 삭제는 `/api/admin/delete-member`가 전담하며, 서무에게 무엇이
지워지는지 먼저 보여준다.

### 삭제를 막는 참조

`leave_priorities.set_by`는 `profiles`를 가리키는데 **연쇄 삭제가 아니다.** 그래서 순번을
한 번이라도 지정한 서무는 이 행을 먼저 지우지 않으면 프로필 삭제 자체가 `23503`으로
거부된다. 서무가 돌아가며 맡는 구조라 전 서무가 전출할 때 반드시 걸린다.
`delete-member`가 이 순서를 맞춘다.

`quota_settings.created_by`도 사람을 가리키지만, 정원 설정은 **부대 공용 설정이라 사람과
함께 사라지면 안 된다.** 삭제할 때 만든이를 삭제를 실행한 서무 앞으로 넘긴다.

## 실행 기록

### 2026-08-08 · `특가` 유형 추가

`lib/utils.ts`의 `LEAVE_TYPES`에 `특가`를 넣었더니 신청이 거부됐다.
`type` 칸에 허용 목록(check 제약조건)이 걸려 있어서 코드만 고쳐서는 안 된다.
**앞으로 유형을 추가할 때마다 이 SQL을 다시 실행해야 한다.**

```sql
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_type_check;

ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_type_check
  CHECK (type IN ('연가','병가','공가','특가','교육','출장','휴직'));
```

> `sub_reason`(연가의 일반/오전/오후)에는 이런 제약이 없어서 코드만 고치면 된다.

### 2026-08-08 · 게시글 공지 기능

```sql
ALTER TABLE board_posts
  ADD COLUMN IF NOT EXISTS is_notice boolean NOT NULL DEFAULT false;
```

### 2026-08-08 · 글·댓글 수정 기능 + 공지 권한 정리

`board_posts`에 UPDATE 권한이 아예 없어서 공지 지정이 조용히 실패하던 것을 함께 고쳤다.
대원에게는 `content`만 열어주고, 공지는 서버에서만 바꾸도록 정리한 것이 이 SQL이다.

```sql
-- 수정 시각. 비어 있으면 "수정된 적 없음"
ALTER TABLE board_posts    ADD COLUMN IF NOT EXISTS updated_at timestamp;
ALTER TABLE board_comments ADD COLUMN IF NOT EXISTS updated_at timestamp;

-- 공지 지정은 서버(/api/admin/toggle-notice)에서만 하므로 클라이언트 정책은 없앤다
DROP POLICY IF EXISTS "seomu_can_update_board_posts" ON board_posts;

-- 본인이 쓴 글·댓글만 수정 가능
DROP POLICY IF EXISTS "author_can_update_own_post" ON board_posts;
CREATE POLICY "author_can_update_own_post"
  ON board_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "author_can_update_own_comment" ON board_comments;
CREATE POLICY "author_can_update_own_comment"
  ON board_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

-- 고칠 수 있는 칸을 제한한다. 대원이 자기 글을 공지로 올리는 것을 막는 핵심.
REVOKE UPDATE ON board_posts    FROM authenticated;
REVOKE UPDATE ON board_comments FROM authenticated;
GRANT  UPDATE (content, updated_at) ON board_posts    TO authenticated;
GRANT  UPDATE (content, updated_at) ON board_comments TO authenticated;
```

### 2026-08-08 · 정원 설정 수정 기능

정원 설정을 고칠 수 있게 만들면서 두 가지가 필요했다.

원래 이 표에는 **종료일 칸이 없었다.** 종료일을 지정하면 "그 다음날부터 이전 설정으로
되돌리는 행"을 하나 더 몰래 만들어 흉내 냈고, 화면의 `적용 기간`도 다음 행의 시작일에서
역산한 값이었다. 그 상태로는 어떤 설정의 종료일을 바꾸려면 **다른 행**을 고쳐야 해서
수정 기능을 붙일 수 없었다. 이제 한 행이 한 기간을 온전히 담는다.

수정 권한도 없었다. 지금까지 이 표를 수정한 적이 없어서다(게시판 공지 때와 같은 상황).

```sql
-- 적용 종료일. 비어 있으면 다음 설정이 시작하기 전까지 계속 적용된다.
ALTER TABLE quota_settings ADD COLUMN IF NOT EXISTS effective_to date;

-- 정원은 부대 공용 설정이므로 서무만 고칠 수 있다.
DROP POLICY IF EXISTS "admin_can_update_quota_settings" ON quota_settings;
CREATE POLICY "admin_can_update_quota_settings"
  ON quota_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
```

기존 행은 종료일이 비어 있어 이전과 똑같이 계속 적용된다.

> 대원 완전 삭제(`/api/admin/delete-member`)에는 **SQL이 필요 없었다.** 표 구조가 아니라
> 지우는 순서의 문제였기 때문이다.

---

## 데이터 정리 기록

### 2026-08-08 · 유령 계정 3개 삭제

`profiles`에 대응하는 행이 없는 auth 계정 3개(테스트·미접속 계정)와
그중 하나가 쓴 게시글 1건을 지웠다. auth 29개 → 26개로 `profiles`와 일치.

### 2026-08-08 · 시범 운영 데이터 전체 삭제

정식 사용 시작 전에 테스트로 쌓인 내용을 모두 지웠다.
`profiles` 26명(계정)은 그대로 두었다.

| 표 | 지운 건수 |
|---|---|
| `leave_requests` | 20 |
| `board_posts` | 6 |
| `board_comments` | 3 |
| `leave_priorities` | 17 |
| `date_comments` | 3 |

---

## SQL을 실행하는 방법

1. [supabase.com/dashboard](https://supabase.com/dashboard) → 프로젝트 선택
2. 왼쪽 메뉴 **SQL Editor** → **New query**
3. SQL을 붙여넣고 **Run**
4. **"Success. No rows returned"** 이 뜨면 정상

`DROP`이 들어간 SQL은 **"Potential issue detected"** 경고창이 뜬다.
Supabase가 `DROP`이라는 단어만 보고 띄우는 것이라, 위 SQL들은 그대로 **Run query**를 눌러도 된다.
(`DROP POLICY IF EXISTS`는 같은 이름의 권한 정책 하나만 지우고, 데이터는 건드리지 않는다.)
