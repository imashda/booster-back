'use strict';

const { Router } = require('express');
const { pool } = require('../config/database');

const router = Router();

// Must be registered BEFORE the '/' mount below: app.js applies `authenticate` to every
// path under it with no exceptions, so a request would be swallowed and 401'd before ever
// reaching a /health handler declared after that mount. Orchestrators (Railway/Render/K8s)
// hit this unauthenticated — a 401 here reads as "unhealthy" and triggers restart loops.
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ success: false, status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
  }
});

router.use('/auth',     require('./auth'));
router.use('/',         require('./app'));
router.use('/admin',    require('./admin'));

module.exports = router;
