async function sendPasswordResetEmail(email, token) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.APP_PUBLIC_URL;
  if (!apiKey || !from || !appUrl) return false;

  let base;
  try {
    base = new URL(appUrl);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) {
      return false;
    }
  } catch {
    return false;
  }

  const resetUrl = new URL('/reset-password', base);
  resetUrl.hash = new URLSearchParams({ token }).toString();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: '떠나요 비밀번호 재설정',
      text: `아래 링크에서 비밀번호를 재설정해 주세요. 링크는 30분 동안 사용할 수 있습니다.\n\n${resetUrl.toString()}\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
}

module.exports = { sendPasswordResetEmail };
