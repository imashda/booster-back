'use strict';

const { Router } = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');

const profileCtrl     = require('../controllers/ProfileController');
const quizCtrl        = require('../controllers/QuizController');
const gameCtrl        = require('../controllers/GameController');
const shopCtrl        = require('../controllers/ShopController');
const skinCtrl        = require('../controllers/SkinController');
const leaderboardCtrl = require('../controllers/LeaderboardController');

const { answerQuizSchema, submitGameResultSchema, orderShopItemSchema, buySkinSchema, equipSkinSchema } =
  require('../validators/app');

const router = Router();

// authenticate — per-route, не router.use(authenticate) на весь роутер: этот роутер смонтирован
// на '/' и ловит вообще любой путь под /api, не занятый /auth и /admin. Блочный authenticate
// отрабатывал бы даже для несуществующих путей (например, опечатки в URL) ДО того, как Express
// вообще проверит, есть ли такой роут — в итоге неавторизованный запрос на несуществующий путь
// получал бы 401 "Токен не предоставлен" вместо честного 404 "Маршрут не найден".
router.get('/me',                authenticate, asyncHandler(profileCtrl.getProfile.bind(profileCtrl)));
router.get('/me/skins',          authenticate, asyncHandler(profileCtrl.getMySkins.bind(profileCtrl)));
router.get('/me/skins/equipped', authenticate, asyncHandler(profileCtrl.getEquippedSkin.bind(profileCtrl)));
router.get('/me/transactions',   authenticate, asyncHandler(profileCtrl.getTransactions.bind(profileCtrl)));
router.get('/me/house',          authenticate, asyncHandler(profileCtrl.getMyHouseLevel.bind(profileCtrl)));

// Quiz
router.get('/quiz/today',   authenticate, asyncHandler(quizCtrl.getTodayQuiz.bind(quizCtrl)));
router.post('/quiz/answer', authenticate, answerQuizSchema, validate, asyncHandler(quizCtrl.answerQuiz.bind(quizCtrl)));

// Mini-games
router.get('/games',          authenticate, asyncHandler(gameCtrl.getGames.bind(gameCtrl)));
router.post('/games/result',  authenticate, submitGameResultSchema, validate, asyncHandler(gameCtrl.submitGameResult.bind(gameCtrl)));

// Shop
router.get('/shop',        authenticate, asyncHandler(shopCtrl.getShopItems.bind(shopCtrl)));
router.post('/shop/order', authenticate, orderShopItemSchema, validate, asyncHandler(shopCtrl.requestShopItem.bind(shopCtrl)));

// Skins (образы)
router.get('/skins',        authenticate, asyncHandler(skinCtrl.getSkins.bind(skinCtrl)));
router.post('/skins/buy',   authenticate, buySkinSchema,  validate, asyncHandler(skinCtrl.buySkin.bind(skinCtrl)));
router.post('/skins/equip', authenticate, equipSkinSchema, validate, asyncHandler(skinCtrl.equipSkin.bind(skinCtrl)));

// Leaderboard & House levels
router.get('/leaderboard',        authenticate, asyncHandler(leaderboardCtrl.getLeaderboard.bind(leaderboardCtrl)));
router.get('/house-levels',       authenticate, asyncHandler(leaderboardCtrl.getHouseLevels.bind(leaderboardCtrl)));
router.post('/house-levels/buy-next', authenticate, asyncHandler(leaderboardCtrl.buyNextHouseLevel.bind(leaderboardCtrl)));

module.exports = router;
