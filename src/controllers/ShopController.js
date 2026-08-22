'use strict';

const shopService = require('../services/ShopService');

class ShopController {
  async getShopItems(req, res) {
    const data = await shopService.listItems(req.query.category);
    res.json({ success: true, data });
  }

  async requestShopItem(req, res) {
    const data = await shopService.placeOrder(req.user.id, req.body.item_id);
    res.status(201).json({
      success: true,
      message: 'Заявка создана. Администратор свяжется с вами.',
      data,
    });
  }
}

module.exports = new ShopController();
