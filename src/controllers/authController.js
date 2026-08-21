'use strict';

const authService = require('../services/AuthService');

class AuthController {
  async register(req, res) {
    const { full_name, phone, grade } = req.body;
    const result = await authService.register({ fullName: full_name, phone, grade });
    res.status(201).json({ success: true, ...result });
  }

  async login(req, res) {
    const data = await authService.login(req.body.phone, req.body.password);
    res.json({ success: true, data });
  }

  async refreshToken(req, res) {
    const data = await authService.refreshTokens(req.body.refreshToken);
    res.json({ success: true, data });
  }

  async logout(req, res) {
    await authService.logout(req.body.refreshToken);
    res.json({ success: true, message: 'Выход выполнен' });
  }

  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ success: true, message: 'Пароль успешно изменён' });
  }
}

module.exports = new AuthController();
