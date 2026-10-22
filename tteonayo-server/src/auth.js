const jwt = require('jsonwebtoken');
const store = require('./store');

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_ID || process.env.DATABASE_URL) {
    throw new Error('배포 환경과 PostgreSQL 사용 시 JWT_SECRET 환경변수가 필요합니다.');
  }
  JWT_SECRET = store.getLocalJwtSecret();
}

function signToken(user) {
  return jwt.sign({ id: user.id, tokenVersion: user.tokenVersion ?? 0 }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

function signPasswordResetToken(user) {
  return jwt.sign({ id: user.id, tokenVersion: user.tokenVersion ?? 0, purpose: 'password-reset' }, JWT_SECRET, {
    expiresIn: '30m',
  });
}

function verifyPasswordResetToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.purpose !== 'password-reset' || !Number.isInteger(payload.id)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization; // "Bearer <token>"
  const token = header && header.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: '토큰이 유효하지 않습니다.' });
  }
  if (!payload || payload.purpose || !Number.isInteger(payload.id) || payload.id < 1) {
    return res.status(401).json({ error: '토큰이 유효하지 않습니다.' });
  }
  try {
    const user = await store.getUserById(payload.id);
    if (!user || (payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: '로그인 정보가 변경됐어요. 다시 로그인해 주세요.' });
    }
    req.user = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { signToken, signPasswordResetToken, verifyPasswordResetToken, requireAuth };
