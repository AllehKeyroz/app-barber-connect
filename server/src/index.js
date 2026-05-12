require('dotenv').config();

const express = require('express');
const { login, getCurrentCookies, getCookieHeader, closeBrowser } = require('./auth');
const { sendCookiesToWebhook } = require('./webhook');
const { startScheduler, executeRefresh, getStatus } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    const status = getStatus();
    const cookies = getCurrentCookies();
    const hasCookies = Object.keys(cookies).length > 0;
    
    res.json({
        status: hasCookies ? 'healthy' : 'no_session',
        scheduler: status,
        cookies_active: hasCookies,
        uptime: process.uptime()
    });
});

// Status detalhado
app.get('/status', (req, res) => {
    const status = getStatus();
    const cookies = getCurrentCookies();
    
    res.json({
        scheduler: status,
        cookies: Object.keys(cookies),
        cookie_header: getCookieHeader() ? getCookieHeader().substring(0, 50) + '...' : null
    });
});

// Forcar refresh manual
app.post('/refresh', async (req, res) => {
    console.log('[API] Refresh manual solicitado');
    const result = await executeRefresh();
    res.json(result);
});

// Forcar login completo
app.post('/login', async (req, res) => {
    console.log('[API] Login manual solicitado');
    const result = await login();
    
    if (result.success) {
        const cookies = getCurrentCookies();
        const cookieHeader = getCookieHeader();
        await sendCookiesToWebhook(cookies, cookieHeader);
    }
    
    res.json({
        success: result.success,
        error: result.error || null,
        cookies: result.success ? Object.keys(result.cookies) : []
    });
});

// Inicializacao
async function init() {
    console.log('===========================================');
    console.log(' AppBarber Session Server');
    console.log('===========================================');
    console.log(`Email: ${process.env.APPBARBER_EMAIL}`);
    console.log(`Webhook: ${process.env.WEBHOOK_URL}`);
    console.log(`Refresh: a cada ${process.env.REFRESH_INTERVAL || 30} minutos`);
    console.log('-------------------------------------------');
    
    // Fazer login inicial
    console.log('[Init] Fazendo login inicial...');
    const loginResult = await login();
    
    if (loginResult.success) {
        console.log('[Init] Login inicial bem-sucedido!');
        
        // Enviar cookies para webhook
        const cookies = getCurrentCookies();
        const cookieHeader = getCookieHeader();
        await sendCookiesToWebhook(cookies, cookieHeader);
        
        // Iniciar scheduler
        startScheduler();
    } else {
        console.error('[Init] Login inicial FALHOU:', loginResult.error);
        console.log('[Init] Scheduler sera iniciado mesmo assim. Tentara novamente no proximo ciclo.');
        startScheduler();
    }
    
    // Iniciar servidor HTTP
    app.listen(PORT, () => {
        console.log(`[Server] Rodando na porta ${PORT}`);
        console.log(`[Server] Health check: http://localhost:${PORT}/health`);
        console.log('===========================================');
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('[Server] Encerrando...');
    await closeBrowser();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('[Server] Encerrando...');
    await closeBrowser();
    process.exit(0);
});

init();
