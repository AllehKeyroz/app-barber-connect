require('dotenv').config();

const path = require('path');
const express = require('express');
const { login, getCurrentCookies, verifySession, closeBrowser } = require('./auth');
const { sendCookiesToWebhook, getLastSentCookies } = require('./webhook');
const { startScheduler, executeCycle, executeForcedLogin, getStatus } = require('./scheduler');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API - Status completo
app.get('/api/status', (req, res) => {
    const status = getStatus();
    const cookies = getCurrentCookies();
    const lastSent = getLastSentCookies();
    const hasCookies = Object.keys(cookies).length > 0;
    
    res.json({
        status: hasCookies ? 'healthy' : 'no_session',
        lastStatus: status.lastStatus,
        lastSync: status.lastSync,
        cookiesActive: hasCookies,
        activeCookies: Object.keys(cookies),
        cookieHeader: hasCookies ? cookiesToString(cookies) : null,
        cookiesMatchLastSent: lastSent ? JSON.stringify(cookies) === JSON.stringify(lastSent) : false,
        scheduler: status,
        uptime: (Date.now() - startTime) / 1000
    });
});

// API - Logs
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json({ logs: logger.getHistory(limit) });
});

// API - Refresh
app.post('/api/refresh', async (req, res) => {
    logger.info('[API] Refresh manual solicitado');
    const result = await executeCycle();
    res.json(result);
});

// API - Login forçado
app.post('/api/login', async (req, res) => {
    logger.info('[API] Login manual solicitado');
    const result = await executeForcedLogin();
    res.json(result);
});

// Health check
app.get('/health', (req, res) => {
    const status = getStatus();
    const cookies = getCurrentCookies();
    res.json({
        status: Object.keys(cookies).length > 0 ? 'healthy' : 'no_session',
        uptime: (Date.now() - startTime) / 1000,
        scheduler: status.running,
        lastSync: status.lastSync
    });
});

function cookiesToString(cookies) {
    const parts = [];
    for (const [key, val] of Object.entries(cookies)) {
        parts.push(`${key}=${val}`);
    }
    return parts.join('; ');
}

// Inicializacao
async function init() {
    logger.info('===========================================');
    logger.info(' AppBarber Session Server');
    logger.info('===========================================');
    logger.info(`Email: ${process.env.APPBARBER_EMAIL}`);
    logger.info(`Webhook: ${process.env.WEBHOOK_URL}`);
    logger.info(`Verificacao: a cada ${process.env.VERIFY_INTERVAL || 60} min`);
    logger.info(`Refresh forcado: a cada ${process.env.REFRESH_INTERVAL || 360} min`);
    logger.info('-------------------------------------------');
    
    // Login inicial
    const loginResult = await login();
    
    if (loginResult.success) {
        const cookies = getCurrentCookies();
        const cookieHeader = cookiesToString(cookies);
        await sendCookiesToWebhook(cookies, cookieHeader);
    }
    
    // Iniciar scheduler (ciclo de verificacao)
    startScheduler();
    
    // Iniciar servidor HTTP
    app.listen(PORT, () => {
        const baseUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
        logger.info(`[Server] Rodando na porta ${PORT}`);
        logger.info(`[Server] Dashboard: ${baseUrl}`);
        logger.info(`[Server] Health: ${baseUrl}/health`);
        logger.info('===========================================');
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('[Server] Encerrando...');
    await closeBrowser();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('[Server] Encerrando...');
    await closeBrowser();
    process.exit(0);
});

init();
