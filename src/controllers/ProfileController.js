'use strict';

const userRepo = require('../repositories/UserRepository');
const skinService = require('../services/SkinService');
const walletService = require('../services/WalletService');

class ProfileController {
  async getProfile(req, res) {
    const data = await userRepo.findProfile(req.user.id);
    res.json({ success: true, data });
  }

  async getEquippedSkins(req, res) {
    const data = await skinService.getEquippedSkins(req.user.id);
    res.json({ success: true, data });
  }

  async getTransactions(req, res) {
    const { type, limit = 20, offset = 0 } = req.query;
    const data = await walletService.getTransactionHistory(
      req.user.id, type, parseInt(limit, 10), parseInt(offset, 10)
    );
    res.json({ success: true, data });
  }

  async getMyHouseLevel(req, res) {
    const data = await userRepo.findHouseProgress(req.user.id);
    res.json({ success: true, data });
  }
}

module.exports = new ProfileController();
