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
router.use(authenticate);

// Profile
router.get('/me',                asyncHandler(profileCtrl.getProfile.bind(profileCtrl)));
router.get('/me/skins',          asyncHandler(profileCtrl.getMySkins.bind(profileCtrl)));
router.get('/me/skins/equipped', asyncHandler(profileCtrl.getEquippedSkins.bind(profileCtrl)));
router.get('/me/transactions',   asyncHandler(profileCtrl.getTransactions.bind(profileCtrl)));
router.get('/me/house',          asyncHandler(profileCtrl.getMyHouseLevel.bind(profileCtrl)));

// Quiz
router.get('/quiz/today',   asyncHandler(quizCtrl.getTodayQuiz.bind(quizCtrl)));
router.post('/quiz/answer', answerQuizSchema, validate, asyncHandler(quizCtrl.answerQuiz.bind(quizCtrl)));

// Mini-games
router.get('/games',          asyncHandler(gameCtrl.getGames.bind(gameCtrl)));
router.post('/games/result',  submitGameResultSchema, validate, asyncHandler(gameCtrl.submitGameResult.bind(gameCtrl)));

// Shop
router.get('/shop',        asyncHandler(shopCtrl.getShopItems.bind(shopCtrl)));
router.post('/shop/order', orderShopItemSchema, validate, asyncHandler(shopCtrl.requestShopItem.bind(shopCtrl)));

// Skins
router.get('/skins',            asyncHandler(skinCtrl.getSkins.bind(skinCtrl)));
router.get('/skins/categories', asyncHandler(skinCtrl.getSkinCategories.bind(skinCtrl)));
router.post('/skins/buy',       buySkinSchema,  validate, asyncHandler(skinCtrl.buySkin.bind(skinCtrl)));
router.post('/skins/equip',     equipSkinSchema, validate, asyncHandler(skinCtrl.equipSkin.bind(skinCtrl)));

// Leaderboard & House levels
router.get('/leaderboard',        asyncHandler(leaderboardCtrl.getLeaderboard.bind(leaderboardCtrl)));
router.get('/house-levels',       asyncHandler(leaderboardCtrl.getHouseLevels.bind(leaderboardCtrl)));
router.post('/house-levels/buy-next', asyncHandler(leaderboardCtrl.buyNextHouseLevel.bind(leaderboardCtrl)));

module.exports = router;
