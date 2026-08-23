'use strict';

const skinService = require('../services/SkinService');

class SkinController {
  async getSkins(req, res) {
    const data = await skinService.listSkins(req.user.id);
    res.json({ success: true, data });
  }

  async buySkin(req, res) {
    const data = await skinService.buySkin(req.user.id, req.body.skin_id);
    res.json({ success: true, message: 'Образ куплен!', data });
  }

  async equipSkin(req, res) {
    const { skin_id } = req.body;
    const data = await skinService.equipSkin(req.user.id, skin_id);
    res.json({ success: true, message: skin_id ? 'Образ надет' : 'Образ снят', data });
  }
}

module.exports = new SkinController();
