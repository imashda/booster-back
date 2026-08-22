'use strict';

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../config/database');
const userRepo = require('../repositories/UserRepository');
const registrationRepo = require('../repositories/RegistrationRepository');
const tokenRepo = require('../repositories/TokenRepository');
const walletRepo = require('../repositories/WalletRepository');
const walletService = require('./WalletService');
const authService = require('./AuthService');
const { NotFoundError, BadRequestError } = require('../domain/errors');
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

    const login = await authService.generateUniqueLogin();
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
        login,
        passwordHash,
        fullName: request.full_name,
        grade: request.grade,
        parentName: request.parent_name,
        parentPhone: request.parent_phone,
      }, client);
      await registrationRepo.approve(requestId, adminId, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Логин и пароль отдаются куратору в ответе вместе с контактом родителя — он пересылает
    // их на WhatsApp родителя сам (автоотправки нет).
    return {
      userId: newUserId,
      login,
      rawPassword,
      parentName: request.parent_name,
      parentPhone: request.parent_phone,
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

  // Прямое создание пользователя админом, минуя очередь заявок — например, для тестовых
  // аккаунтов. Логин генерируется так же, как при апруве заявки.
  async createUser({ fullName, grade, parentName, parentPhone }) {
    const normalizedParentPhone = parentPhone.replace(/\D/g, '');
    const login = await authService.generateUniqueLogin();
    const rawPassword = authService.generatePassword();
    const passwordHash = await authService.hashPassword(rawPassword);
    const newUserId = uuidv4();

    await userRepo.create({
      id: newUserId, login, passwordHash, fullName, grade,
      parentName, parentPhone: normalizedParentPhone,
    });

    return { userId: newUserId, login, rawPassword, parentName, parentPhone: normalizedParentPhone };
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

    return { login: user.login, rawPassword };
  }

  async setHouseLevelPrice(level, priceFoxes) {
    const updated = await walletRepo.setLevelPrice(level, priceFoxes ?? null);
    if (!updated) throw new NotFoundError('Уровень дома не найден');
    return updated;
  }
}

module.exports = new AdminService();
