'use strict';

const { Router } = require('express');
const { pool } = require('../config/database');

const router = Router();

router.use('/auth',     require('./auth'));
router.use('/',         require('./app'));
router.use('/admin',    require('./admin'));

// Liveness/readiness probe for orchestrators (Docker/K8s/Railway/Render) — verifies the
// process can actually reach the database, not just that Express is up.
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ success: false, status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
  }
});

module.exports = router;
