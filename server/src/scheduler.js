const cron = require('node-cron');
const { verifySession, refreshSession, login, getCurrentCookies } = require('./auth');
const { sendCookiesToWebhook } = require('./webhook');
const logger = require('./logger');

let verifyCronJob = null;
let refreshCronJob = null;
let lastSync = null;
let lastStatus = 'unknown';

function cookiesToHeader(cookies) {
    const parts = [];
    for (const [key, val] of Object.entries(cookies)) {
        parts.push(`${key}=${val}`);
    }
    return parts.join('; ');
}

async function executeCycle() {
    logger.info('[Ciclo] Iniciando ciclo de verificacao...');
    
    // Passo 1: Verificar se sessao esta ativa
    const verifyResult = await verifySession();
    
    if (verifyResult.alive) {
        logger.success('[Ciclo] Sessao OK, verificando cookies...');
        
        const cookies = getCurrentCookies();
        if (Object.keys(cookies).length > 0) {
            const cookieHeader = cookiesToHeader(cookies);
            await sendCookiesToWebhook(cookies, cookieHeader);
        }
        
        lastSync = new Date().toISOString();
        lastStatus = 'ok';
        return { status: 'ok' };
    }
    
    // Passo 2: Sessao expirou - tentar refresh ou relogin
    logger.warn(`[Ciclo] Sessao expirada: ${verifyResult.reason}`);
    
    const refreshResult = await refreshSession();
    
    if (refreshResult.success) {
        logger.success('[Ciclo] Sessao renovada com sucesso');
        
        const cookies = getCurrentCookies();
        const cookieHeader = cookiesToHeader(cookies);
        await sendCookiesToWebhook(cookies, cookieHeader);
        
        lastSync = new Date().toISOString();
        lastStatus = 'renewed';
        return { status: 'renewed' };
    } else {
        logger.error(`[Ciclo] Falha ao renovar sessao: ${refreshResult.error}`);
        lastSync = new Date().toISOString();
        lastStatus = 'error';
        return { status: 'error', error: refreshResult.error };
    }
}

async function executeForcedLogin() {
    logger.info('[Ciclo] Login forca do solicitado...');
    
    const loginResult = await login();
    
    if (loginResult.success) {
        const cookies = getCurrentCookies();
        const cookieHeader = cookiesToHeader(cookies);
        // Forcar envio mesmo que cookies sejam iguais
        // Resetando o ultimo estado para garantir
        const { sendCookiesToWebhook: send } = require('./webhook');
        
        const WEBHOOK_URL = process.env.WEBHOOK_URL;
        if (WEBHOOK_URL) {
            await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'cookie_sync',
                    source: 'server',
                    force: true,
                    cookies: cookies,
                    cookie_header_full: cookieHeader,
                    timestamp: new Date().toISOString()
                })
            });
        }
        
        lastSync = new Date().toISOString();
        lastStatus = 'forcelogin';
        return { success: true };
    }
    
    return { success: false, error: loginResult.error };
}

function startScheduler() {
    const verifyMinutes = parseInt(process.env.VERIFY_INTERVAL) || 60;
    const refreshMinutes = parseInt(process.env.REFRESH_INTERVAL) || 360;
    
    logger.info(`[Scheduler] Verificacao a cada ${verifyMinutes}min, refresh forcado a cada ${refreshMinutes}min`);
    
    // Cron para verificacao leve - so checa cookies
    verifyCronJob = cron.schedule(`*/${verifyMinutes} * * * *`, async () => {
        await executeCycle();
    });
    
    // Cron para refresh forcado com navegacao completa
    refreshCronJob = cron.schedule(`*/${refreshMinutes} * * * *`, async () => {
        logger.info('[Scheduler] Refresh forcado periodico...');
        const result = await refreshSession();
        
        if (result.success) {
            const cookies = getCurrentCookies();
            const cookieHeader = cookiesToHeader(cookies);
            await sendCookiesToWebhook(cookies, cookieHeader);
        }
    });
    
    logger.info('[Scheduler] Scheduler ativo');
}

function stopScheduler() {
    if (verifyCronJob) { verifyCronJob.stop(); verifyCronJob = null; }
    if (refreshCronJob) { refreshCronJob.stop(); refreshCronJob = null; }
    logger.info('[Scheduler] Scheduler parado');
}

function getStatus() {
    return {
        running: verifyCronJob !== null,
        lastSync,
        lastStatus,
        verifyInterval: `${process.env.VERIFY_INTERVAL || 60} minutos`,
        refreshInterval: `${process.env.REFRESH_INTERVAL || 360} minutos`
    };
}

module.exports = {
    startScheduler,
    stopScheduler,
    executeCycle,
    executeForcedLogin,
    getStatus
};
