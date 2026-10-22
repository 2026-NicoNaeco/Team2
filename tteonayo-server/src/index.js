if (process.env.TTEONAYO_SKIP_DOTENV !== '1') require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const store = require('./store');
const { signToken, signPasswordResetToken, verifyPasswordResetToken, requireAuth } = require('./auth');
const { sendPasswordResetEmail } = require('./recoveryMail');
const travelRoutes = require('./travelRoutes');
const chatRoutes = require('./chatRoutes');
const placeSearchRoutes = require('./placeSearchRoutes');
const boardRoutes = require('./boardRoutes');
const publicUser = ({ id, email, name }) => ({ id, email, name });

const app = express();
const clientOrigins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
if ((process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_ID) && !process.env.CLIENT_ORIGINS) {
  throw new Error('운영 환경에는 CLIENT_ORIGINS 환경변수가 필요합니다.');
}
app.use(cors({ origin: (origin, callback) => callback(null, !origin || clientOrigins.includes(origin)) }));
app.use(express.json({ limit: '8mb' }));

// 회원가입
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' ||
      !email.trim() || !name.trim()) {
    return res.status(400).json({ error: '이메일, 비밀번호, 이름을 모두 입력해주세요.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '비밀번호는 6자 이상이어야 해요.' });
  }

  const existing = await store.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = await store.createUser({ email, name, passwordHash });
  if (!newUser) return res.status(409).json({ error: '이미 가입된 이메일이에요.' });

  res.status(201).json({ token: signToken(newUser), user: publicUser(newUser) });
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  const row = await store.getUserByEmail(email);
  if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않아요.' });
  }

  res.json({ token: signToken(row), user: publicUser(row) });
});

app.post('/api/auth/find-email', async (req, res) => {
  const { name, password } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.length > 30 ||
      typeof password !== 'string' || !password || password.length > 200) {
    return res.status(400).json({ error: '닉네임과 비밀번호를 입력해 주세요.' });
  }
  const candidates = await store.getUsersByName(name.trim());
  for (const candidate of candidates) {
    if (await bcrypt.compare(password, candidate.passwordHash)) {
      return res.json({ email: candidate.email });
    }
  }
  return res.status(404).json({ error: '일치하는 계정을 찾을 수 없어요.' });
});

app.post('/api/auth/password-reset/request', async (req, res) => {
  const email = req.body?.email;
  if (typeof email !== 'string' || !email.trim() || email.length > 254) {
    return res.status(400).json({ error: '가입한 이메일을 입력해 주세요.' });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.APP_PUBLIC_URL) {
    return res.status(503).json({ error: '비밀번호 재설정 메일 기능이 아직 설정되지 않았어요.' });
  }
  const user = await store.getUserByEmail(email.trim());
  if (!user || !await store.claimPasswordReset(user.id)) {
    return res.json({ message: '가입된 이메일이라면 재설정 링크를 보내드렸어요.' });
  }
  try {
    const sent = await sendPasswordResetEmail(user.email, signPasswordResetToken(user));
    if (!sent) console.warn('비밀번호 재설정 메일 전송에 실패했습니다.');
  } catch {
    console.warn('비밀번호 재설정 메일 전송에 실패했습니다.');
  }
  return res.json({ message: '가입된 이메일이라면 재설정 링크를 보내드렸어요.' });
});

app.post('/api/auth/password-reset/confirm', async (req, res) => {
  const { token, newPassword } = req.body ?? {};
  if (typeof token !== 'string' || token.length > 2000 ||
      typeof newPassword !== 'string' || newPassword.length < 6 ||
      Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ error: '재설정 링크와 새 비밀번호(6자 이상)를 확인해 주세요.' });
  }
  const payload = verifyPasswordResetToken(token);
  if (!payload) return res.status(400).json({ error: '재설정 링크가 만료되었거나 유효하지 않아요.' });
  const user = await store.getUserById(payload.id);
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    return res.status(400).json({ error: '재설정 링크가 만료되었거나 유효하지 않아요.' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await store.changeUserPassword(user.id, user.passwordHash, passwordHash);
  if (!updated) return res.status(400).json({ error: '재설정 링크가 만료되었거나 유효하지 않아요.' });
  return res.json({ message: '비밀번호가 변경됐어요. 새 비밀번호로 로그인해 주세요.' });
});

// 로그인한 사용자 정보 조회 (토큰 검증용, 새로고침 시 로그인 유지에 사용)
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const row = await store.getUserById(req.user.id);
  if (!row) return res.status(404).json({ error: '사용자를 찾을 수 없어요.' });
  res.json({ user: publicUser(row) });
});

app.put('/api/auth/me', requireAuth, async (req, res) => {
  const name = req.body?.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 30 ||
      /[\u0000-\u001f\u007f]/.test(name)) {
    return res.status(400).json({ error: '닉네임은 1~30자로 입력해 주세요.' });
  }
  const row = await store.updateUserName(req.user.id, name.trim());
  if (!row) return res.status(404).json({ error: '사용자를 찾을 수 없어요.' });
  res.json({ user: publicUser(row) });
});

app.put('/api/auth/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || !currentPassword ||
      typeof newPassword !== 'string' || newPassword.length < 6 ||
      Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호(6자 이상, UTF-8 72바이트 이하)를 확인해 주세요.' });
  }
  const row = await store.getUserById(req.user.id);
  if (!row) return res.status(404).json({ error: '사용자를 찾을 수 없어요.' });
  if (!await bcrypt.compare(currentPassword, row.passwordHash)) {
    return res.status(403).json({ error: '현재 비밀번호가 올바르지 않아요.' });
  }
  if (await bcrypt.compare(newPassword, row.passwordHash)) {
    return res.status(409).json({ error: '새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await store.changeUserPassword(req.user.id, row.passwordHash, passwordHash);
  if (!updated) return res.status(409).json({ error: '비밀번호가 다른 곳에서 변경됐어요. 다시 로그인해 주세요.' });
  res.json({ token: signToken(updated), user: publicUser(updated) });
});

app.delete('/api/auth/me', requireAuth, async (req, res) => {
  const password = req.body?.password;
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: '계정 삭제를 위해 현재 비밀번호를 입력해 주세요.' });
  }
  const user = await store.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없어요.' });
  if (!await bcrypt.compare(password, user.passwordHash)) {
    return res.status(403).json({ error: '현재 비밀번호가 올바르지 않아요.' });
  }
  const deleted = await store.deleteUser(user.id, user.passwordHash);
  if (!deleted) return res.status(409).json({ error: '계정 정보가 변경됐어요. 다시 로그인해 주세요.' });
  return res.json({ message: '계정이 삭제됐어요.' });
});

app.use('/api/travel', requireAuth, travelRoutes);
app.use('/api/chat', requireAuth, chatRoutes);
app.use('/api/places', requireAuth, placeSearchRoutes);
app.use('/api/boards', requireAuth, boardRoutes);

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    const message = req.path.startsWith('/api/boards')
      ? '사진을 포함한 저장 데이터가 8MB를 초과했어요. 사진을 제거하거나 더 작은 파일을 선택한 뒤 다시 저장해 주세요. 현재 내용은 저장되지 않았어요.'
      : '저장 데이터가 너무 큽니다.';
    return res.status(413).json({ error: message });
  }
  console.error('요청 처리 오류:', error);
  res.status(500).json({ error: '요청을 처리하지 못했습니다.' });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  store.ensureReady().then(() => app.listen(PORT, () => {
    console.log(`떠나요 백엔드 서버 실행 중: http://localhost:${PORT}`);
  })).catch((error) => {
    console.error('데이터베이스 준비 실패:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = app;
