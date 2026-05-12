const logger = require('./logger');

const WEBHOOK_URL = process.env.WEBHOOK_URL;
let lastSentCookies = null;

function cookiesAreDifferent(current, last) {
    if (!last) return true;
    
    const currentStr = JSON.stringify(current);
    const lastStr = JSON.stringify(last);
    
    return currentStr !== lastStr;
}

async function sendCookiesToWebhook(cookies, cookieHeader) {
    if (!WEBHOOK_URL) {
        logger.error('[Webhook] WEBHOOK_URL nao configurada');
        return { success: false, error: 'WEBHOOK_URL not set' };
    }

    // So envia se os cookies mudaram
    if (!cookiesAreDifferent(cookies, lastSentCookies)) {
        logger.info('[Webhook] Cookies inalterados, skipping webhook');
        return { success: true, skipped: true };
    }

    logger.info('[Webhook] Alteracao detectada, enviando para:', WEBHOOK_URL);

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                event: 'cookie_sync',
                source: 'server',
                cookies: cookies,
                cookie_header_full: cookieHeader,
                timestamp: new Date().toISOString()
            })
        });

        if (response.ok) {
            lastSentCookies = { ...cookies };
            logger.success('[Webhook] Cookies enviados com sucesso');
            return { success: true, status: response.status };
        } else {
            logger.error(`[Webhook] Erro HTTP: ${response.status}`);
            return { success: false, status: response.status };
        }
    } catch (error) {
        logger.error(`[Webhook] Erro ao enviar: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function getLastSentCookies() {
    return lastSentCookies;
}

module.exports = { sendCookiesToWebhook, getLastSentCookies };
