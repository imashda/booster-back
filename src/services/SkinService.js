'use strict';

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const skinRepo = require('../repositories/SkinRepository');
const userRepo = require('../repositories/UserRepository');
const walletService = require('./WalletService');
const { NotFoundError, BadRequestError, ConflictError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');

class SkinService {
  async listSkins(userId) {
    return skinRepo.findAll(userId);
  }

  async getEquippedSkin(userId) {
    return skinRepo.findEquipped(userId);
  }

  async listOwnedSkins(userId) {
    return skinRepo.findOwned(userId);
  }

  async buySkin(userId, skinId) {
    const [skin, user] = await Promise.all([
      skinRepo.findById(skinId),
      userRepo.findById(userId),
    ]);

    if (!skin) throw new NotFoundError('Образ не найден');

    const alreadyOwned = await skinRepo.isOwned(userId, skinId);
    if (alreadyOwned) throw new ConflictError('Образ уже куплен');

    if (user.level < skin.level_req) {
      throw new BadRequestError(
        `Для этого образа нужен уровень ${skin.level_req}. Ваш уровень: ${user.level}`
      );
    }
    if (user.foxes < skin.price_foxes) {
      throw new BadRequestError(
        `Недостаточно Фоксов. Нужно: ${skin.price_foxes}, у вас: ${user.foxes}`
      );
    }

    const purchaseId = uuidv4();

    // Списание FOX и EXP-бонус за покупку — одна транзакция, чтобы не начислить бонус
    // без списания (или наоборот) при сбое между шагами.
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await skinRepo.purchase(client, { id: purchaseId, userId, skinId });
      const foxResult = await walletService.changeFoxes(
        userId, -skin.price_foxes,
        TRANSACTION_TYPES.SKIN_PURCHASE, `Покупка образа: ${skin.name}`, purchaseId, client
      );

      let expResult = null;
      if (skin.exp_bonus > 0) {
        expResult = await walletService.changeExp(
          userId, skin.exp_bonus,
          TRANSACTION_TYPES.SKIN_PURCHASE, `Бонус за покупку образа: ${skin.name}`, purchaseId, client
        );
      }

      await client.query('COMMIT');

      return {
        skinId,
        newFoxesBalance: foxResult.newBalance,
        expBonus: skin.exp_bonus,
        newExp: expResult?.newExp,
        leveledUp: expResult?.leveledUp,
        newLevel: expResult?.newLevel,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Один образ надет за раз — категорий больше нет. skinId=null снимает текущий образ.
  async equipSkin(userId, skinId) {
    if (skinId) {
      const owned = await skinRepo.isOwned(userId, skinId);
      if (!owned) throw new BadRequestError('Образ не куплен');
    }

    await skinRepo.equip(userId, skinId ?? null);
    return { skinId: skinId ?? null };
  }

  async createSkin(data) {
    return skinRepo.createSkin({ id: uuidv4(), levelReq: 1, ...data });
  }

  async updateSkin(id, data) {
    const skin = await skinRepo.updateSkin(id, data);
    if (!skin) throw new NotFoundError('Образ не найден');
    return skin;
  }
}

module.exports = new SkinService();
