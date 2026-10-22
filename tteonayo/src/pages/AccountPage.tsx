import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import styles from './AccountPage.module.css';

const inputClass = `${styles.input} rounded-lg border border-line bg-white px-4 py-3 text-base leading-6 outline-none focus:border-teal`;

export default function AccountPage() {
  const { user, updateName, changePassword, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState<'name' | 'password' | 'delete' | null>(null);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const nextName = name.trim();
    setNameError('');
    setNameSuccess('');
    if (!nextName || nextName.length > 30) {
      setNameError('닉네임은 1~30자로 입력해 주세요.');
      return;
    }
    setSaving('name');
    try {
      const updated = await updateName(nextName);
      setName(updated.name);
      setNameSuccess('닉네임이 변경됐어요.');
    } catch (error) {
      setNameError(error instanceof Error ? error.message : '닉네임을 변경하지 못했어요.');
    } finally {
      setSaving(null);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 6 || new TextEncoder().encode(newPassword).length > 72) {
      setPasswordError('새 비밀번호는 6자 이상, UTF-8 72바이트 이하로 입력해 주세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('새 비밀번호와 확인 입력이 일치하지 않아요.');
      return;
    }
    setSaving('password');
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('비밀번호가 변경됐어요. 다른 기기의 기존 로그인은 해제됩니다.');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : '비밀번호를 변경하지 못했어요.');
    } finally {
      setSaving(null);
    }
  };

  const removeAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !user || !deletePassword) return;
    setDeleteError('');
    if (!window.confirm('계정과 내가 소유한 일정판을 삭제할까요? 이 작업은 되돌릴 수 없어요.')) return;
    setSaving('delete');
    try {
      await deleteAccount(deletePassword);
      navigate('/login', { replace: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '계정을 삭제하지 못했어요.');
      setSaving(null);
    }
  };

  return <>
    <Topbar title="계정 설정" stamp="내 정보" />
    <main className={`min-w-0 flex-1 overflow-y-auto bg-paper ${styles.main}`}>
      <div className={styles.content}>
        <section className={`${styles.card} rounded-2xl border border-line bg-white`}>
          <h1 className="m-0 font-display text-2xl leading-8 font-bold text-ink">회원 정보</h1>
          <p className={`${styles.description} text-base leading-7 text-ink-soft`}>닉네임은 화면에 표시되는 이름이에요.</p>
          <div className={styles.emailField}>
            <span className="mb-2 block text-sm leading-6 text-muted">이메일</span>
            <span className="block break-all text-base leading-7 text-ink">{user?.email}</span>
          </div>
          <form onSubmit={saveName} className={styles.form}>
            <div>
              <label htmlFor="account-name" className={`${styles.label} text-sm leading-6 text-ink-soft`}>닉네임</label>
              <input id="account-name" type="text" required maxLength={30} autoComplete="nickname"
                value={name} onChange={(event) => { setName(event.target.value); setNameSuccess(''); }}
                className={inputClass} />
            </div>
            {nameError && <p role="alert" className="m-0 text-sm leading-6 text-pin">{nameError}</p>}
            {nameSuccess && <p role="status" className="m-0 text-sm leading-6 text-teal-deep">{nameSuccess}</p>}
            <button type="submit" disabled={saving !== null || name.trim() === user?.name}
              className="self-start rounded-lg border-none bg-teal-deep px-6 py-3 text-base leading-6 font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
              {saving === 'name' ? '저장 중…' : '닉네임 저장'}
            </button>
          </form>
        </section>

        <section className={`${styles.card} rounded-2xl border border-line bg-white`}>
          <h2 className="m-0 font-display text-2xl leading-8 font-bold text-ink">비밀번호 변경</h2>
          <p className={`${styles.description} text-base leading-7 text-ink-soft`}>현재 비밀번호를 확인한 뒤 새 비밀번호를 저장해요.</p>
          <form onSubmit={savePassword} className={styles.form}>
            <div>
              <label htmlFor="current-password" className={`${styles.label} text-sm leading-6 text-ink-soft`}>현재 비밀번호</label>
              <input id="current-password" type="password" required autoComplete="current-password"
                value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label htmlFor="new-password" className={`${styles.label} text-sm leading-6 text-ink-soft`}>새 비밀번호</label>
              <input id="new-password" type="password" required minLength={6} autoComplete="new-password"
                value={newPassword} onChange={(event) => setNewPassword(event.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label htmlFor="confirm-password" className={`${styles.label} text-sm leading-6 text-ink-soft`}>새 비밀번호 확인</label>
              <input id="confirm-password" type="password" required minLength={6} autoComplete="new-password"
                value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}
                className={inputClass} />
            </div>
            {passwordError && <p role="alert" className="m-0 text-sm leading-6 text-pin">{passwordError}</p>}
            {passwordSuccess && <p role="status" className="m-0 text-sm leading-6 text-teal-deep">{passwordSuccess}</p>}
            <button type="submit" disabled={saving !== null}
              className="self-start rounded-lg border-none bg-teal-deep px-6 py-3 text-base leading-6 font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
              {saving === 'password' ? '변경 중…' : '비밀번호 변경'}
            </button>
          </form>
        </section>
        <section className={`${styles.card} rounded-2xl border border-line bg-white`}>
          <h2 className="m-0 font-display text-2xl leading-8 font-bold text-ink">계정 삭제</h2>
          <p className={`${styles.description} text-base leading-7 text-ink-soft`}>
            계정과 내가 소유한 일정판이 삭제돼요. 다른 사람에게 공유한 일정판도 더 이상 열 수 없어요.
          </p>
          <form onSubmit={removeAccount} className={styles.form}>
            <div>
              <label htmlFor="delete-password" className={`${styles.label} text-sm leading-6 text-ink-soft`}>현재 비밀번호 확인</label>
              <input id="delete-password" type="password" required autoComplete="current-password"
                value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className={inputClass} />
            </div>
            {deleteError && <p role="alert" className="m-0 text-sm leading-6 text-pin">{deleteError}</p>}
            <button type="submit" disabled={saving !== null || !deletePassword}
              className="self-start rounded-lg border border-pin bg-white px-6 py-3 text-base leading-6 font-semibold text-pin cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
              {saving === 'delete' ? '삭제 중…' : '계정 삭제'}
            </button>
          </form>
        </section>
      </div>
    </main>
  </>;
}
