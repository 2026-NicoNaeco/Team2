import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { findAccountEmail, requestPasswordReset } from '../services/accountRecovery';

type Mode = 'login' | 'signup' | 'find-email' | 'reset-request';
const inputClass = 'w-full border border-line rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-teal';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const changeMode = (next: Mode) => {
    setMode(next);
    setError('');
    setMessage('');
    setPassword('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate('/home');
      } else if (mode === 'signup') {
        await signup(email, password, name);
        navigate('/home');
      } else if (mode === 'find-email') {
        const found = await findAccountEmail(name.trim(), password);
        setEmail(found);
        setPassword('');
        setMessage(`가입된 이메일: ${found}`);
      } else {
        setMessage(await requestPasswordReset(email.trim()));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '문제가 발생했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const description = {
    login: '다시 만나서 반가워요.',
    signup: '떠나요와 함께 여행을 기록해보세요.',
    'find-email': '가입할 때 사용한 닉네임과 비밀번호로 이메일을 확인해요.',
    'reset-request': '가입한 이메일로 비밀번호 재설정 링크를 보내드려요.',
  }[mode];

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-[380px] bg-white border border-line rounded-2xl p-7 sm:p-9">
        <div className="font-display font-bold text-2xl text-teal-deep mb-1">떠나요</div>
        <p className="text-sm text-[#7A7364] mb-7">{description}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {(mode === 'signup' || mode === 'find-email') && (
            <div>
              <label htmlFor="auth-name" className="text-xs text-[#7A7364] mb-1 block">닉네임</label>
              <input id="auth-name" type="text" required maxLength={30} value={name}
                onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="가입한 닉네임" />
            </div>
          )}
          {mode !== 'find-email' && (
            <div>
              <label htmlFor="auth-email" className="text-xs text-[#7A7364] mb-1 block">이메일</label>
              <input id="auth-email" type="email" required value={email}
                onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="you@example.com" />
            </div>
          )}
          {mode !== 'reset-request' && (
            <div>
              <label htmlFor="auth-password" className="text-xs text-[#7A7364] mb-1 block">비밀번호</label>
              <input id="auth-password" type="password" required minLength={mode === 'find-email' ? undefined : 6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password}
                onChange={(event) => setPassword(event.target.value)} className={inputClass}
                placeholder={mode === 'signup' ? '6자 이상' : '비밀번호 입력'} />
            </div>
          )}

          {error && <p role="alert" className="text-xs text-pin m-0">{error}</p>}
          {message && <p role="status" className="text-sm text-teal-deep m-0 break-all">{message}</p>}
          <button type="submit" disabled={submitting}
            className="mt-2 bg-teal-deep text-white rounded-lg py-2.5 text-sm font-semibold cursor-pointer border-none disabled:opacity-60">
            {submitting ? '처리 중...' : {
              login: '로그인', signup: '회원가입', 'find-email': '가입 이메일 확인', 'reset-request': '재설정 링크 받기',
            }[mode]}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {mode !== 'login' && <button type="button" onClick={() => changeMode('login')}
            className="text-teal-deep bg-transparent border-none cursor-pointer underline">로그인으로 돌아가기</button>}
          {mode === 'login' && <button type="button" onClick={() => changeMode('signup')}
            className="text-teal-deep bg-transparent border-none cursor-pointer underline">회원가입</button>}
          {(mode === 'login' || mode === 'signup') && <button type="button" onClick={() => changeMode('find-email')}
            className="text-teal-deep bg-transparent border-none cursor-pointer underline">가입 이메일 찾기</button>}
          {mode !== 'reset-request' && <button type="button" onClick={() => changeMode('reset-request')}
            className="text-teal-deep bg-transparent border-none cursor-pointer underline">비밀번호 재설정</button>}
        </div>
      </div>
    </div>
  );
}
