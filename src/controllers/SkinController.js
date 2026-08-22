'use strict';

const skinService = require('../services/SkinService');

class SkinController {
  async getSkins(req, res) {
    const data = await skinService.listSkins(req.user.id, req.query.category_slug);
    res.json({ success: true, data });
  }

  async getSkinCategories(req, res) {
    const data = await skinService.listCategories();
    res.json({ success: true, data });
  }

  async buySkin(req, res) {
    const data = await skinService.buySkin(req.user.id, req.body.skin_id);
    res.json({ success: true, message: 'Скин куплен!', data });
  }

  async equipSkin(req, res) {
    const { skin_id, category_id } = req.body;
    const data = await skinService.equipSkin(req.user.id, skin_id, category_id);
    res.json({ success: true, message: skin_id ? 'Скин надет' : 'Скин снят', data });
  }
}

module.exports = new SkinController();
