const jwt = require('jsonwebtoken');
const { randomBytes } = require('node:crypto');
const db = require('./db');

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') throw new Error('운영 환경에는 JWT_SECRET 환경변수가 필요합니다.');
  JWT_SECRET = db.get('jwtSecret').value();
  if (!JWT_SECRET) {
    JWT_SECRET = randomBytes(32).toString('hex');
    db.set('jwtSecret', JWT_SECRET).write();
  }
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization; // "Bearer <token>"
  const token = header && header.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '토큰이 유효하지 않습니다.' });
  }
}

module.exports = { signToken, requireAuth };
