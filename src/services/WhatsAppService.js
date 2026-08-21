'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../shared/logger');

class WhatsAppService {
  constructor() {
    this._isDev = config.server.env !== 'production';
  }

  async sendMessage(phone, message) {
    const normalizedPhone = phone.replace(/\D/g, '');

    if (this._isDev) {
      logger.info('[WhatsApp MOCK]', { to: `+${normalizedPhone}`, message });
      return { success: true, mock: true };
    }

    try {
      const response = await axios.post(
        `https://api.ultramsg.com/${config.whatsapp.instanceId}/messages/chat`,
        { token: config.whatsapp.apiToken, to: `+${normalizedPhone}`, body: message },
        { timeout: 10_000 }
      );
      return { success: true, data: response.data };
    } catch (err) {
      logger.error('WhatsApp send failed', { phone: normalizedPhone, error: err.message });
      return { success: false, error: err.message };
    }
  }

  sendPassword(phone, fullName, password) {
    const message =
      `Привет, ${fullName}! 👋\n\n` +
      `Ваш аккаунт в приложении *Booster* подтверждён!\n\n` +
      `📱 Логин: ${phone}\n🔑 Пароль: ${password}\n\n` +
      `Скачайте приложение и начните зарабатывать Фоксы! 🦊`;
    return this.sendMessage(phone, message);
  }

  sendRegistrationRejected(phone, fullName, reason) {
    const message =
      `❌ ${fullName}, ваша заявка на регистрацию в *Booster* отклонена.\n\n` +
      `Причина: ${reason || 'Не указана'}\n\n` +
      `Обратитесь к администратору.`;
    return this.sendMessage(phone, message);
  }

  sendShopOrderConfirmation(phone, fullName, itemName, orderId) {
    const message =
      `🛍️ ${fullName}, ваша заявка на *${itemName}* принята!\n\n` +
      `Номер заявки: ${orderId}\n\n` +
      `Администратор свяжется с вами для уточнения деталей.`;
    return this.sendMessage(phone, message);
  }
}

module.exports = new WhatsAppService();
