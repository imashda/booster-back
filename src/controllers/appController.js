'use strict';

// This file is intentionally left as a re-export barrel.
// Domain logic has been split into focused controllers:
//   ProfileController, QuizController, GameController,
//   ShopController, SkinController, LeaderboardController

module.exports = {
  ...require('./ProfileController'),
  ...require('./QuizController'),
  ...require('./GameController'),
  ...require('./ShopController'),
  ...require('./SkinController'),
  ...require('./LeaderboardController'),
};
