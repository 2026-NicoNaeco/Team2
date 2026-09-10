const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { signToken, requireAuth } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// 회원가입
app.post('/api/auth/signup', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: '이메일, 비밀번호, 이름을 모두 입력해주세요.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '비밀번호는 6자 이상이어야 해요.' });
  }

  const existing = db.get('users').find({ email }).value();
  if (existing) {
    return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
  }

  const id = db.get('nextId').value();
  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = { id, email, name, passwordHash };

  db.get('users').push(newUser).write();
  db.set('nextId', id + 1).write();

  const user = { id, email, name };
  const token = signToken(user);
  res.status(201).json({ token, user });
});

// 로그인
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  const row = db.get('users').find({ email }).value();
  if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않아요.' });
  }

  const user = { id: row.id, email: row.email, name: row.name };
  const token = signToken(user);
  res.json({ token, user });
});

// 로그인한 사용자 정보 조회 (토큰 검증용, 새로고침 시 로그인 유지에 사용)
app.get('/api/auth/me', requireAuth, (req, res) => {
  const row = db.get('users').find({ id: req.user.id }).value();
  if (!row) return res.status(404).json({ error: '사용자를 찾을 수 없어요.' });
  res.json({ user: { id: row.id, email: row.email, name: row.name } });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`떠나요 백엔드 서버 실행 중: http://localhost:${PORT}`);
});
