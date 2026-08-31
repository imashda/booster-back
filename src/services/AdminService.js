'use strict';

const { v4: uuidv4 } = require('uuid');
const userRepo = require('../repositories/UserRepository');
const tokenRepo = require('../repositories/TokenRepository');
const walletRepo = require('../repositories/WalletRepository');
const walletService = require('./WalletService');
const authService = require('./AuthService');
const { NotFoundError } = require('../domain/errors');
const { TRANSACTION_TYPES } = require('../constants');

class AdminService {
  async getDashboardStats() {
    const [totalStudents, activeStudents, foxesInCirculation, quizScheduledToday, pendingOrders] =
      await Promise.all([
        userRepo.countStudents(),
        userRepo.countActiveStudents(),
        userRepo.sumFoxes(),
        require('../repositories/QuizRepository').isScheduledToday(),
        require('../repositories/ShopRepository').countPendingOrders(),
      ]);

    return {
      users: { total: totalStudents, active: activeStudents },
      foxesInCirculation,
      quizScheduledToday,
      pendingShopOrders: pendingOrders,
    };
  }

  async listUsers(filters) {
    return userRepo.search({
      ...filters,
      limit: Number(filters.limit ?? 20),
      offset: Number(filters.offset ?? 0),
    });
  }

  // Прямое создание пользователя админом (например, тестовые аккаунты) — в отличие от
  // самостоятельной регистрации, здесь логин/пароль генерируются автоматически, не пользователем.
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
