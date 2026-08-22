'use strict';

const adminService = require('../services/AdminService');
const quizService = require('../services/QuizService');
const shopService = require('../services/ShopService');
const skinService = require('../services/SkinService');

class AdminController {
  async getDashboardStats(req, res) {
    const data = await adminService.getDashboardStats();
    res.json({ success: true, data });
  }

  async getRegistrationRequests(req, res) {
    const { status, limit, offset } = req.query;
    const data = await adminService.listRegistrationRequests({ status, limit, offset });
    res.json({ success: true, ...data });
  }

  async approveRegistration(req, res) {
    const data = await adminService.approveRegistration(req.params.id, req.user.id);
    res.json({ success: true, message: 'Заявка одобрена, пользователь создан', data });
  }

  async rejectRegistration(req, res) {
    await adminService.rejectRegistration(req.params.id, req.user.id, req.body.reason);
    res.json({ success: true, message: 'Заявка отклонена' });
  }

  async getUsers(req, res) {
    const { search, status, role, limit, offset } = req.query;
    const data = await adminService.listUsers({ search, status, role, limit, offset });
    res.json({ success: true, ...data });
  }

  async createUser(req, res) {
    const { full_name, phone, grade } = req.body;
    const data = await adminService.createUser({ fullName: full_name, phone, grade });
    res.status(201).json({ success: true, message: 'Пользователь создан', data });
  }

  async updateUserStatus(req, res) {
    const data = await adminService.updateUserStatus(req.params.id, req.body.status);
    res.json({ success: true, data });
  }

  async grantFoxes(req, res) {
    const { amount, description } = req.body;
    const data = await adminService.grantFoxes(req.params.id, amount, description, req.user.full_name);
    res.json({ success: true, data });
  }

  async grantExp(req, res) {
    const { amount, description } = req.body;
    const data = await adminService.grantExp(req.params.id, amount, description, req.user.full_name);
    res.json({ success: true, data });
  }

  async resetPassword(req, res) {
    const data = await adminService.resetPassword(req.params.id);
    res.json({ success: true, message: 'Пароль сброшен и отправлен на WhatsApp', data });
  }

  async getQuestions(req, res) {
    const data = await quizService.listQuestions(req.query);
    res.json({ success: true, data });
  }

  async createQuestion(req, res) {
    const { question, option_a, option_b, option_c, option_d, correct, category, difficulty } = req.body;
    const data = await quizService.createQuestion({
      question,
      optionA: option_a, optionB: option_b, optionC: option_c, optionD: option_d,
      correct, category, difficulty, createdBy: req.user.id,
    });
    res.status(201).json({ success: true, data });
  }

  async scheduleQuiz(req, res) {
    const data = await quizService.scheduleQuestions(req.body.quiz_date, req.body.question_ids);
    res.json({ success: true, data });
  }

  async createShopItem(req, res) {
    const { name, description, image_url, price_foxes, whatsapp_link, category } = req.body;
    const data = await shopService.createItem({
      name, description,
      imageUrl: image_url, priceFoxes: price_foxes, whatsappLink: whatsapp_link, category,
    });
    res.status(201).json({ success: true, data });
  }

  async updateShopItem(req, res) {
    const { name, description, image_url, price_foxes, whatsapp_link, category, is_active, sort_order } = req.body;
    const data = await shopService.updateItem(req.params.id, {
      name, description,
      imageUrl: image_url, priceFoxes: price_foxes, whatsappLink: whatsapp_link,
      category, isActive: is_active, sortOrder: sort_order,
    });
    res.json({ success: true, data });
  }

  async createSkin(req, res) {
    const { category_id, name, description, image_url, price_foxes, level_req, exp_bonus } = req.body;
    const data = await skinService.createSkin({
      categoryId: category_id, name, description,
      imageUrl: image_url, priceFoxes: price_foxes, levelReq: level_req ?? 1, expBonus: exp_bonus ?? 0,
    });
    res.status(201).json({ success: true, data });
  }

  async updateSkin(req, res) {
    const { name, description, image_url, price_foxes, level_req, exp_bonus, is_active } = req.body;
    const data = await skinService.updateSkin(req.params.id, {
      name, description,
      imageUrl: image_url, priceFoxes: price_foxes, levelReq: level_req, expBonus: exp_bonus, isActive: is_active,
    });
    res.json({ success: true, data });
  }

  async updateHouseLevelPrice(req, res) {
    const data = await adminService.setHouseLevelPrice(Number(req.params.level), req.body.price_foxes);
    res.json({ success: true, data });
  }
}

module.exports = new AdminController();
