import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, password, name);
      }
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : '문제가 발생했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="w-full max-w-[380px] bg-white border border-line rounded-2xl p-9">
        <div className="font-display font-bold text-2xl text-teal-deep mb-1">떠나요</div>
        <p className="text-sm text-[#7A7364] mb-7">
          {mode === 'login' ? '다시 만나서 반가워요.' : '떠나요와 함께 여행을 기록해보세요.'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {mode === 'signup' && (
            <div>
              <label className="text-xs text-[#7A7364] mb-1 block">이름</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-teal"
                placeholder="해진"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-[#7A7364] mb-1 block">이메일</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-teal"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-[#7A7364] mb-1 block">비밀번호</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-teal"
              placeholder="6자 이상"
            />
          </div>

          {error && <p className="text-xs text-pin m-0">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-teal-deep text-white rounded-lg py-2.5 text-sm font-semibold cursor-pointer border-none disabled:opacity-60"
          >
            {submitting ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError('');
          }}
          className="mt-5 text-xs text-teal-deep bg-transparent border-none cursor-pointer underline"
        >
          {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
        </button>
      </div>
    </div>
  );
}
