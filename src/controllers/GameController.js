'use strict';

const gameService = require('../services/GameService');

class GameController {
  async getGames(req, res) {
    const data = await gameService.listGames(req.user.id);
    res.json({ success: true, data });
  }

  async submitGameResult(req, res) {
    const { game_id, score } = req.body;
    const data = await gameService.submitResult(req.user.id, game_id, score);
    res.json({ success: true, data });
  }
}

module.exports = new GameController();
