const express = require('express');
const boards = require('./boardService');

const router = express.Router();

function handler(action) {
  return async (req, res, next) => {
    try { await action(req, res); } catch (error) {
      if (error instanceof boards.BoardError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };
}

router.get('/', handler(async (req, res) => {
  res.json({ boards: await boards.list(req.user.id) });
}));

router.post('/', handler(async (req, res) => {
  res.status(201).json({ board: await boards.create(req.user.id, req.body) });
}));

router.get('/:boardId', handler(async (req, res) => {
  res.json({ board: await boards.get(req.params.boardId, req.user.id) });
}));

router.put('/:boardId', handler(async (req, res) => {
  res.json({ board: await boards.update(req.params.boardId, req.user.id, req.body) });
}));

router.post('/:boardId/members', handler(async (req, res) => {
  res.status(201).json({ board: await boards.addMemberByEmail(req.params.boardId, req.user.id, req.body?.email) });
}));

router.delete('/:boardId/members/:userId', handler(async (req, res) => {
  await boards.removeMember(req.params.boardId, req.user.id, Number(req.params.userId));
  res.status(204).end();
}));

router.delete('/:boardId', handler(async (req, res) => {
  await boards.remove(req.params.boardId, req.user.id);
  res.status(204).end();
}));

module.exports = router;
