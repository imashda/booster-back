'use strict';

const { v4: uuidv4 } = require('uuid');
const shopRepo = require('../repositories/ShopRepository');
const userRepo = require('../repositories/UserRepository');
const walletService = require('./WalletService');
const whatsAppService = require('./WhatsAppService');
const { NotFoundError, BadRequestError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');

class ShopService {
  async listItems(category) {
    return shopRepo.findActiveItems(category);
  }

  async placeOrder(userId, itemId) {
    const [item, user] = await Promise.all([
      shopRepo.findItemById(itemId),
      userRepo.findById(userId),
    ]);

    if (!item) throw new NotFoundError('Товар не найден');
    if (user.foxes < item.price_foxes) {
      throw new BadRequestError(
        `Недостаточно Фоксов. Нужно: ${item.price_foxes}, у вас: ${user.foxes}`
      );
    }

    const orderId = uuidv4();
    await shopRepo.createOrder({ id: orderId, userId, itemId, foxesSpent: item.price_foxes });
    await walletService.changeFoxes(
      userId, -item.price_foxes,
      TRANSACTION_TYPES.SHOP_PURCHASE, `Покупка: ${item.name}`, orderId
    );

    whatsAppService.sendShopOrderConfirmation(user.phone, user.full_name, item.name, orderId)
      .catch(() => {});

    return {
      orderId,
      itemName: item.name,
      foxesSpent: item.price_foxes,
      whatsappLink: item.whatsapp_link ?? null,
    };
  }

  async createItem(data) {
    return shopRepo.createItem({ id: uuidv4(), ...data });
  }

  async updateItem(id, data) {
    const item = await shopRepo.updateItem(id, data);
    if (!item) throw new NotFoundError('Товар не найден');
    return item;
  }
}

module.exports = new ShopService();
