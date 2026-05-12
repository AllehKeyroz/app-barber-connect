const cron = require('node-cron');
const { refreshSession, getCurrentCookies, getCookieHeader } = require('./auth');
const { sendCookiesToWebhook } = require('./webhook');

let cronJob = null;
let lastSync = null;
let lastStatus = null;

async function executeRefresh() {
    console.log('[Scheduler] Executando refresh...');
    
    const result = await refreshSession();
    
    if (result.success) {
        const cookies = getCurrentCookies();
        const cookieHeader = getCookieHeader();
        
        const webhookResult = await sendCookiesToWebhook(cookies, cookieHeader);
        
        lastSync = new Date().toISOString();
        lastStatus = webhookResult.success ? 'success' : 'webhook_failed';
        
        console.log('[Scheduler] Refresh completo - webhook:', webhookResult.success ? 'OK' : 'FALHOU');
    } else {
        lastSync = new Date().toISOString();
        lastStatus = 'login_failed';
        console.error('[Scheduler] Refresh falhou:', result.error);
    }
    
    return { lastSync, lastStatus };
}

function startScheduler() {
    const intervalMinutes = parseInt(process.env.REFRESH_INTERVAL) || 30;
    
    console.log(`[Scheduler] Iniciando scheduler a cada ${intervalMinutes} minutos`);
    
    // Cron expression: a cada N minutos
    const cronExpression = `*/${intervalMinutes} * * * *`;
    
    cronJob = cron.schedule(cronExpression, async () => {
        await executeRefresh();
    });
    
    console.log('[Scheduler] Scheduler ativo');
}

function stopScheduler() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        console.log('[Scheduler] Scheduler parado');
    }
}

function getStatus() {
    return {
        running: cronJob !== null,
        lastSync,
        lastStatus,
        interval: `${process.env.REFRESH_INTERVAL || 30} minutos`
    };
}

module.exports = {
    startScheduler,
    stopScheduler,
    executeRefresh,
    getStatus
};
