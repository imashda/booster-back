'use strict';

const leaderboardService = require('../services/LeaderboardService');

class LeaderboardController {
  async getLeaderboard(req, res) {
    const data = await leaderboardService.getLeaderboard(req.user.id);
    res.json({ success: true, data });
  }

  async getHouseLevels(req, res) {
    const data = await leaderboardService.getAllHouseLevels();
    res.json({ success: true, data });
  }

  async buyNextHouseLevel(req, res) {
    const data = await leaderboardService.buyNextHouseLevel(req.user.id);
    res.json({ success: true, message: 'Уровень куплен!', data });
  }
}

module.exports = new LeaderboardController();
