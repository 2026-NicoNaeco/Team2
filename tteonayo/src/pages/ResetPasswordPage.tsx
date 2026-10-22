import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { confirmPasswordReset } from '../services/accountRecovery';

export default function ResetPasswordPage() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('새 비밀번호와 확인 입력이 일치하지 않아요.');
      return;
    }
    setSubmitting(true);
    try {
      setSuccess(await confirmPasswordReset(token, password));
      setPassword('');
      setConfirmation('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호를 변경하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="min-h-screen flex items-center justify-center bg-paper px-4 py-8">
    <div className="w-full max-w-[380px] rounded-2xl border border-line bg-white p-7 sm:p-9">
      <h1 className="m-0 font-display text-2xl font-bold text-teal-deep">비밀번호 재설정</h1>
      {!token ? <p className="my-6 text-sm text-ink-soft">재설정 링크가 유효하지 않아요. 로그인 화면에서 다시 요청해 주세요.</p>
        : success ? <p role="status" className="my-6 text-sm text-teal-deep">{success}</p>
          : <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
            <div>
              <label htmlFor="reset-password" className="mb-2 block text-sm text-ink-soft">새 비밀번호</label>
              <input id="reset-password" type="password" required minLength={6} autoComplete="new-password"
                value={password} onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-line px-3.5 py-2.5 text-sm outline-none focus:border-teal" />
            </div>
            <div>
              <label htmlFor="reset-confirmation" className="mb-2 block text-sm text-ink-soft">새 비밀번호 확인</label>
              <input id="reset-confirmation" type="password" required minLength={6} autoComplete="new-password"
                value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
                className="w-full rounded-lg border border-line px-3.5 py-2.5 text-sm outline-none focus:border-teal" />
            </div>
            {error && <p role="alert" className="m-0 text-sm text-pin">{error}</p>}
            <button type="submit" disabled={submitting}
              className="rounded-lg border-none bg-teal-deep py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-60">
              {submitting ? '변경 중…' : '비밀번호 변경'}
            </button>
          </form>}
      <Link to="/login" className="mt-6 inline-block text-sm text-teal-deep underline">로그인으로 돌아가기</Link>
    </div>
  </div>;
}
