'use strict';

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const skinRepo = require('../repositories/SkinRepository');
const userRepo = require('../repositories/UserRepository');
const walletService = require('./WalletService');
const { NotFoundError, BadRequestError, ConflictError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');

class SkinService {
  async listSkins(userId, categorySlug) {
    return skinRepo.findAll({ userId, categorySlug });
  }

  async listCategories() {
    return skinRepo.findCategories();
  }

  async getEquippedSkins(userId) {
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

    if (!skin) throw new NotFoundError('Скин не найден');

    const alreadyOwned = await skinRepo.isOwned(userId, skinId);
    if (alreadyOwned) throw new ConflictError('Скин уже куплен');

    if (user.level < skin.level_req) {
      throw new BadRequestError(
        `Для этого скина нужен уровень ${skin.level_req}. Ваш уровень: ${user.level}`
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
        TRANSACTION_TYPES.SKIN_PURCHASE, `Покупка скина: ${skin.name}`, purchaseId, client
      );

      // level_bonus — «Прибавка к уровню» из таблицы (в УРОВНЯХ): сколько это
      // EXP, зависит от текущего уровня игрока, поэтому считаем на месте.
      // exp_bonus — сырой опыт, остаётся для скинов, заведённых админом вручную.
      let expResult = null;
      if (skin.level_bonus > 0) {
        expResult = await walletService.grantLevels(
          userId, skin.level_bonus,
          TRANSACTION_TYPES.SKIN_PURCHASE, `Бонус за покупку скина: ${skin.name}`, purchaseId, client
        );
      } else if (skin.exp_bonus > 0) {
        expResult = await walletService.changeExp(
          userId, skin.exp_bonus,
          TRANSACTION_TYPES.SKIN_PURCHASE, `Бонус за покупку скина: ${skin.name}`, purchaseId, client
        );
      }

      await client.query('COMMIT');

      return {
        skinId,
        newFoxesBalance: foxResult.newBalance,
        levelBonus: skin.level_bonus,
        expBonus: expResult ? expResult.newExp - expResult.previousExp : 0,
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

  // category_id выводится из самого скина — так клиент не может надеть скин не в свою категорию
  // (например, головной убор в слот обуви), и фронту не нужно отдельно знать category_id, чтобы что-то надеть.
  // category_id нужен явно только чтобы снять скин (skinId не передан) — иначе неясно, какой слот очищать.
  async equipSkin(userId, skinId, categoryId) {
    if (skinId) {
      const skin = await skinRepo.findById(skinId);
      if (!skin) throw new NotFoundError('Скин не найден');

      const owned = await skinRepo.isOwned(userId, skinId);
      if (!owned) throw new BadRequestError('Скин не куплен');

      categoryId = skin.category_id;
    } else if (!categoryId) {
      throw new BadRequestError('Чтобы снять скин, укажите category_id');
    }

    await skinRepo.equip({ userId, categoryId, skinId: skinId ?? null });
    return { categoryId, skinId: skinId ?? null };
  }

  async createSkin(data) {
    return skinRepo.createSkin({ id: uuidv4(), levelReq: 1, ...data });
  }

  async updateSkin(id, data) {
    const skin = await skinRepo.updateSkin(id, data);
    if (!skin) throw new NotFoundError('Скин не найден');
    return skin;
  }
}

module.exports = new SkinService();
