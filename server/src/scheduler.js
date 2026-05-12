const cron = require('node-cron');
const { login, getCurrentCookies } = require('./auth');
const { sendCookiesToWebhook } = require('./webhook');
const logger = require('./logger');

let cronJob = null;
let lastSync = null;
let lastStatus = 'unknown';
let nextRunTime = null;

function cookiesToHeader(cookies) {
    const parts = [];
    for (const [key, val] of Object.entries(cookies)) {
        parts.push(`${key}=${val}`);
    }
    return parts.join('; ');
}

async function executeCycle() {
    logger.info('[Ciclo] Iniciando ciclo de atualizacao...');
    
    const result = await login();
    
    if (result.success) {
        const cookies = getCurrentCookies();
        const cookieHeader = cookiesToHeader(cookies);
        await sendCookiesToWebhook(cookies, cookieHeader);
        
        lastSync = new Date().toISOString();
        lastStatus = 'ok';
        
        // Calcula proxima execucao
        const intervalHours = parseInt(process.env.REFRESH_INTERVAL) || 4;
        nextRunTime = new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString();
        
        logger.success(`[Ciclo] Ciclo concluido. Proxima atualizacao em ${intervalHours}h`);
        return { success: true };
    } else {
        logger.error(`[Ciclo] Falha: ${result.error}`);
        lastSync = new Date().toISOString();
        lastStatus = 'error';
        return { success: false, error: result.error };
    }
}

function startScheduler() {
    const intervalHours = parseInt(process.env.REFRESH_INTERVAL) || 4;
    
    logger.info(`[Scheduler] Atualizacao a cada ${intervalHours} horas`);
    
    nextRunTime = new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString();
    
    // Cron: a cada N horas
    const cronExpression = `0 */${intervalHours} * * *`;
    
    cronJob = cron.schedule(cronExpression, async () => {
        await executeCycle();
    });
    
    logger.info('[Scheduler] Scheduler ativo');
}

function stopScheduler() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        logger.info('[Scheduler] Scheduler parado');
    }
}

function getNextRun() {
    return nextRunTime;
}

function getStatus() {
    return {
        running: cronJob !== null,
        lastSync,
        lastStatus,
        nextRun: nextRunTime,
        interval: `${process.env.REFRESH_INTERVAL || 4} horas`
    };
}

module.exports = {
    startScheduler,
    stopScheduler,
    executeCycle,
    getNextRun,
    getStatus
};
