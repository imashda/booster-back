'use strict';

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const userRepo = require('../repositories/UserRepository');
const registrationRepo = require('../repositories/RegistrationRepository');
const tokenRepo = require('../repositories/TokenRepository');
const walletRepo = require('../repositories/WalletRepository');
const walletService = require('./WalletService');
const authService = require('./AuthService');
const { NotFoundError, ConflictError, BadRequestError } = require('../domain/errors');
const { REGISTRATION_STATUSES, TRANSACTION_TYPES } = require('../constants');

class AdminService {
  async getDashboardStats() {
    const [totalStudents, activeStudents, pendingRegistrations, foxesInCirculation, quizScheduledToday, pendingOrders] =
      await Promise.all([
        userRepo.countStudents(),
        userRepo.countActiveStudents(),
        registrationRepo.countPending(),
        userRepo.sumFoxes(),
        require('../repositories/QuizRepository').isScheduledToday(),
        require('../repositories/ShopRepository').countPendingOrders(),
      ]);

    return {
      users: { total: totalStudents, active: activeStudents },
      pendingRegistrations,
      foxesInCirculation,
      quizScheduledToday,
      pendingShopOrders: pendingOrders,
    };
  }

  async listRegistrationRequests({ status = 'pending', limit = 20, offset = 0 }) {
    return registrationRepo.list({ status, limit: Number(limit), offset: Number(offset) });
  }

  async approveRegistration(requestId, adminId) {
    const request = await registrationRepo.findById(requestId);
    if (!request) throw new NotFoundError('Заявка не найдена');
    if (request.status !== REGISTRATION_STATUSES.PENDING) {
      throw new BadRequestError(`Заявка уже ${request.status}`);
    }

    const existingUser = await userRepo.findByPhone(request.phone);
    if (existingUser) throw new ConflictError('Пользователь с таким номером уже существует');

    const rawPassword = authService.generatePassword();
    const passwordHash = await authService.hashPassword(rawPassword);
    const newUserId = uuidv4();

    // Создание пользователя и одобрение заявки — одна транзакция: иначе при сбое между
    // шагами пользователь уже создан, а заявка навсегда останется "pending".
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await userRepo.create({
        id: newUserId,
        phone: request.phone,
        passwordHash,
        fullName: request.full_name,
        grade: request.grade,
      }, client);
      await registrationRepo.approve(requestId, adminId, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Логин (phone) и пароль отдаются куратору в ответе — он пересылает их ученику сам
    // (WhatsApp-автоотправки нет).
    return {
      userId: newUserId,
      phone: request.phone,
      rawPassword,
    };
  }

  async rejectRegistration(requestId, adminId, reason) {
    const request = await registrationRepo.findById(requestId);
    if (!request) throw new NotFoundError('Заявка не найдена');
    if (request.status !== REGISTRATION_STATUSES.PENDING) {
      throw new BadRequestError(`Заявка уже ${request.status}`);
    }

    await registrationRepo.reject(requestId, adminId, reason);
  }

  async listUsers(filters) {
    return userRepo.search({
      ...filters,
      limit: Number(filters.limit ?? 20),
      offset: Number(filters.offset ?? 0),
    });
  }

  async createUser({ fullName, phone, grade }) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const existing = await userRepo.findByPhone(normalizedPhone);
    if (existing) throw new ConflictError('Номер уже зарегистрирован');

    const rawPassword = authService.generatePassword();
    const passwordHash = await authService.hashPassword(rawPassword);
    const newUserId = uuidv4();

    await userRepo.create({ id: newUserId, phone: normalizedPhone, passwordHash, fullName, grade });

    return { userId: newUserId, phone: normalizedPhone, rawPassword };
  }

  async updateUserStatus(userId, status) {
    const updated = await userRepo.updateStatus(userId, status);
    if (!updated) throw new NotFoundError('Пользователь не найден');
    return updated;
  }

  async grantFoxes(userId, amount, description, adminName) {
    return walletService.changeFoxes(
      userId, amount,
      TRANSACTION_TYPES.ADMIN_GRANT,
      description || `Начисление от администратора (${adminName})`
    );
  }

  async grantExp(userId, amount, description, adminName) {
    return walletService.changeExp(
      userId, amount,
      TRANSACTION_TYPES.ADMIN_GRANT,
      description || `Начисление EXP от администратора (${adminName})`
    );
  }

  async resetPassword(userId) {
    const user = await userRepo.findById(userId);
    if (!user) throw new NotFoundError('Пользователь не найден');

    const rawPassword = authService.generatePassword();
    const passwordHash = await authService.hashPassword(rawPassword);

    await Promise.all([
      userRepo.updatePassword(userId, passwordHash),
      tokenRepo.deleteByUserId(userId),
    ]);

    return { phone: user.phone, rawPassword };
  }

  async setHouseLevelPrice(level, priceFoxes) {
    const updated = await walletRepo.setLevelPrice(level, priceFoxes ?? null);
    if (!updated) throw new NotFoundError('Уровень дома не найден');
    return updated;
  }
}

module.exports = new AdminService();
