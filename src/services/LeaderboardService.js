'use strict';

const userRepo = require('../repositories/UserRepository');
const walletRepo = require('../repositories/WalletRepository');

class LeaderboardService {
  async getLeaderboard(userId) {
    const [leaderboard, myRank, me] = await Promise.all([
      userRepo.findForLeaderboard(),
      userRepo.findRank(userId),
      userRepo.findPublicById(userId),
    ]);

    return { leaderboard, myRank, me };
  }

  async getAllHouseLevels() {
    return walletRepo.findAllHouseLevels();
  }
}

module.exports = new LeaderboardService();
