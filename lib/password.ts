import { randomInt } from 'node:crypto';

// 서버 전용 모듈이다. node:crypto를 쓰므로 클라이언트 컴포넌트에서 import하면 안 된다.

// 초기 비밀번호에 쓸 문자. 서무가 불러주고 대원이 받아적는 상황을 고려해
// 서로 헷갈리는 글자(0/O, 1/l/I)는 뺐다.
const SAFE_LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const SAFE_UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const SAFE_DIGITS = '23456789';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * 새 계정에 공통으로 넣어주는 초기 비밀번호.
 * 외우기 쉬운 값을 쓰는 대신, 첫 로그인 때 반드시 본인 비밀번호로 바꾸게 해서
 * 이 값이 계속 쓰이는 일이 없도록 한다.
 */
export const INITIAL_PASSWORD = 'knp123';

/**
 * 계정마다 다른 초기 비밀번호를 만든다.
 * 전 대원이 같은 비밀번호를 쓰면 이름·계급만 알아도 남으로 로그인할 수 있어서,
 * 계정별로 무작위 값을 발급하고 첫 로그인 때 본인 비밀번호로 바꾸게 한다.
 */
export function generateInitialPassword(length = 10): string {
  const pool = SAFE_LETTERS + SAFE_UPPER + SAFE_DIGITS;

  // 영문 대/소문자와 숫자가 최소 한 자씩은 들어가도록 먼저 채운다.
  const required = [
    SAFE_LETTERS[randomInt(SAFE_LETTERS.length)],
    SAFE_UPPER[randomInt(SAFE_UPPER.length)],
    SAFE_DIGITS[randomInt(SAFE_DIGITS.length)],
  ];

  const rest = Array.from({ length: Math.max(length - required.length, 0) }, () =>
    pool[randomInt(pool.length)]
  );

  const chars = [...required, ...rest];

  // Fisher-Yates로 섞어 필수 문자가 항상 앞에 오지 않게 한다.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * 새 비밀번호가 쓸 만한지 확인한다.
 * 문제가 있으면 사용자에게 그대로 보여줄 한국어 메시지를, 없으면 null을 돌려준다.
 */
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return '새 비밀번호를 입력해주세요.';
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  }

  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';
  }

  if (/\s/.test(password)) {
    return '비밀번호에 공백은 사용할 수 없습니다.';
  }

  // 모두가 아는 값(예전 공용 비밀번호, 신규 계정 초기 비밀번호)으로 되돌리는 것을 막는다.
  // 이걸 허용하면 강제 변경을 시켜도 아무 의미가 없어진다.
  if (password === 'test1234!' || password === INITIAL_PASSWORD) {
    return '모두가 아는 비밀번호는 사용할 수 없습니다. 본인만 아는 비밀번호로 정해주세요.';
  }

  return null;
}
