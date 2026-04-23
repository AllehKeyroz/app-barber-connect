const TARGET_COOKIES = [
    "starappappbarberappbeleza-_zldp",
    "starappappbarberappbeleza-_zldt",
    "APPBLZ_ID",
    "PHPSESSID"
];
const TARGET_URL = "https://sistema.appbarber.com.br";
const ENDPOINT_DESTINO = "https://n8n-kds-brasil-n8n.znjbnt.easypanel.host/webhook/bffdad22-7ac8-4993-8aee-fa2aa066c516";
const ENDPOINT_AGENDAMENTO = "https://n8n.kdsbrasil.com/webhook/sync-agendamento";

console.log('[Background] Service worker carregado');

// ============================================================
// FUNÇÕES DE NORMALIZAÇÃO
// ============================================================

function normalizarData(dataStr) {
    if (!dataStr) return { data: null, hora: null };
    
    dataStr = decodeURIComponent(dataStr);
    
    // Formato: "2026-12-31 09:00" (new)
    if (dataStr.includes(' ')) {
        const parts = dataStr.split(' ');
        return { data: parts[0], hora: parts[1] };
    }
    
    // Formato: "2026-12-31+09:00" (urlencoded com +)
    if (dataStr.includes('+')) {
        const parts = dataStr.split('+');
        return { data: parts[0], hora: parts[1] };
    }
    
    // Formato: "dd/mm/yyyy" (update)
    if (dataStr.includes('/')) {
        const parts = dataStr.split('/');
        if (parts.length === 3) {
            return { data: `${parts[2]}-${parts[1]}-${parts[0]}`, hora: null };
        }
    }
    
    return { data: dataStr, hora: null };
}

function converterHora(horaStr) {
    if (!horaStr) return null;
    horaStr = decodeURIComponent(horaStr);
    return horaStr;
}

function normalizarDados(rawData, eventType, responseData = null) {
    const normalized = {
        agendamento_id: null,
        comcodigo: null,
        data: null,
        hora: null,
        profissional_id: null,
        servico_id: null,
        cliente_id: null,
        duracao: null,
        motivo: null,
        tipo: null,
        status: null,
        extras: {}
    };
    
    // Verificar se rawData é string ou objeto
    let data = rawData;
    if (typeof rawData === 'string') {
        const params = new URLSearchParams(rawData);
        data = {};
        for (const [key, val] of params.entries()) {
            data[key] = val;
        }
    }
    
    switch (eventType) {
        case 'new':
            // De responseData: agecodigo e comcodigo
            if (responseData && responseData.data && responseData.data[0]) {
                normalized.agendamento_id = responseData.data[0].agecodigo || null;
                normalized.comcodigo = responseData.data[0].comcodigo || null;
            }
            
            // De request data
            const dt = normalizarData(data.dataagendamento);
            normalized.data = dt.data;
            normalized.hora = dt.hora;
            normalized.profissional_id = data.profissional || null;
            normalized.servico_id = data.item || null;
            normalized.cliente_id = data.cliente || null;
            normalized.duracao = data.duracao || null;
            
            // Extras
            normalized.extras = {
                tipoitem: data.tipoitem || null,
                numitens: data.numitens || null,
                ageorigem: data.ageorigem || null,
                cupom: data.cupom || null,
                lembrete: data.lembrete || null,
                tempolembrete: data.tempolembrete || null,
                sms: data.sms || null,
                whats: data.whats || null
            };
            break;
            
        case 'update':
            normalized.agendamento_id = data.codItem || null;
            
            const dt2 = normalizarData(data.dataAlteraAgendamento);
            normalized.data = dt2.data;
            normalized.hora = converterHora(data.horaAlteraAgendamento);
            normalized.profissional_id = data.profissionalAlteraAgendamento || null;
            normalized.servico_id = data.servicoAlteraAgendamento || null;
            
            // Extras
            normalized.extras = {
                tipoAlteraAgendamento: data.tipoAlteraAgendamento || null
            };
            break;
            
        case 'cancelled':
            normalized.agendamento_id = data.agendamento || null;
            normalized.motivo = data.motivo ? decodeURIComponent(data.motivo) : null;
            break;
            
        case 'confirmed':
        case 'showed':
        case 'noshow':
        case 'status_update':
            normalized.agendamento_id = data.agendamento || null;
            normalized.tipo = data.tipo || null;
            normalized.status = data.status || null;
            break;
            
        default:
            // Para qualquer outro caso, copiar tudo
            for (const [key, val] of Object.entries(data)) {
                normalized[key] = val;
            }
    }
    
    return normalized;
}

function construirRawPayload(data) {
    if (typeof data === 'string') return data;
    
    const parts = [];
    for (const [key, val] of Object.entries(data)) {
        if (val !== null && val !== undefined && val !== '') {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
        }
    }
    return parts.join('&');
}

// Função para enviar ao webhook
function enviarWebhook(eventType, schedulingData, rawPayload) {
    console.log('[Background] Enviando para webhook - event:', eventType, schedulingData);
    
    fetch(ENDPOINT_AGENDAMENTO, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            event: eventType,
            scheduling_data: schedulingData,
            raw_payload: rawPayload,
            timestamp: new Date().toISOString()
        })
    })
    .then(response => {
        console.log('[Background] Webhook resposta status:', response.status);
    })
    .catch(err => console.error('[Background] Erro ao enviar webhook:', err));
}

// Função para checar o cookie atual e só enviar ao n8n se for INÉDITO (ou se forçado)
async function checkAndSendCookie(force = false) {
    try {
        let cookieParts = [];
        let cookieData = {};

        for (const cookieName of TARGET_COOKIES) {
            const cookie = await chrome.cookies.get({
                url: TARGET_URL,
                name: cookieName
            });
            if (cookie) {
                cookieParts.push(`${cookieName}=${cookie.value}`);
                cookieData[cookieName] = cookie.value;
            }
        }

        if (cookieParts.length === 0) return;

        let combinedString = cookieParts.join("; ");

        const { lastCombinedState } = await chrome.storage.local.get("lastCombinedState");

        if (force || combinedString !== lastCombinedState) {
            console.log("Alteração de cookies detectada, enviando...");

            await fetch(ENDPOINT_DESTINO, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event: "cookie_sync",
                    cookies: cookieData,
                    cookie_header_full: combinedString,
                    timestamp: new Date().toISOString()
                })
            });

            await chrome.storage.local.set({ 
                lastCombinedState: combinedString,
                lastCookieValue: combinedString,
                lastSyncTimestamp: new Date().toISOString()
            });
        } else {
            await chrome.storage.local.set({ 
                lastSyncTimestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error("Erro na leitura/envio dos cookies:", error);
        throw error;
    }
}

// ============================================================
// LISTENERS
// ============================================================

// 0. Receptor de Mensagens do Popup e Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Rota 1: Botão de Forçar cookies do Popup
    if (message.action === "forceSendCookie") {
        checkAndSendCookie(true)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.toString() }));
        return true; 
    }
    
    // Rota 2: Interceptação Automática de um Novo Agendamento (vindo do content.js - request only)
    if (message.action === "intercepted_scheduling") {
        let rawPayload = message.data || "";
        let url = message.url || "";
        
        let eventType = "new";
        if (url.includes('alteraAgendamento.php')) {
            eventType = "update";
        } else if (url.includes('cancelaHorario.php')) {
            eventType = "cancelled";
        } else if (url.includes('atualizaHorario.php')) {
            const params = new URLSearchParams(rawPayload);
            const tipo = params.get('tipo');
            if (tipo === "5") eventType = "confirmed";
            else if (tipo === "8") eventType = "showed";
            else if (tipo === "1") eventType = "noshow";
            else eventType = "status_update";
        }
        
        const normalized = normalizarDados(rawPayload, eventType);
        const rawPayloadStr = construirRawPayload(typeof rawPayload === 'string' ? rawPayload : normalized);
        
        enviarWebhook(eventType, normalized, rawPayloadStr);
        return true;
    }
    
    // Rota 3: Interceptação com Resposta (vindo do content.js - request + response para new)
    if (message.action === "intercepted_scheduling_with_response") {
        let rawPayload = message.data || "";
        let url = message.url || "";
        let responseData = message.response || null;
        
        const eventType = "new";
        const normalized = normalizarDados(rawPayload, eventType, responseData);
        const rawPayloadStr = construirRawPayload(typeof rawPayload === 'string' ? rawPayload : normalized);
        
        console.log('[Background] Novo agendamento normalizado:', normalized);
        
        enviarWebhook(eventType, normalized, rawPayloadStr);
        return true;
    }
});

// 1. EVENTO: Mudança oficial do Chrome
chrome.cookies.onChanged.addListener((changeInfo) => {
    if (TARGET_COOKIES.includes(changeInfo.cookie.name) && !changeInfo.removed) {
        checkAndSendCookie();
    }
});

// 2. EVENTO: Pageview
chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.url.includes("sistema.appbarber.com.br")) {
        checkAndSendCookie();
    }
});

// 3. EVENTO: Fallback original
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("syncCookieAlarm", { periodInMinutes: 60 });
    checkAndSendCookie();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "syncCookieAlarm") {
        checkAndSendCookie();
    }
});

// ============================================================
// INTERCEPTAÇÃO VIA WEBREQUEST (para update, cancelled, confirmed, showed)
// Não intercepta insereAgendamentov5.php pois usa content.js para ter a resposta
// ============================================================

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        console.log('[WebRequest] Interceptação - URL:', details.url, 'Method:', details.method);
        
        // Detectar qual tipo de requisição
        let eventType = "new";
        
        if (details.url.includes('alteraAgendamento.php')) {
            eventType = "update";
        } else if (details.url.includes('cancelaHorario.php')) {
            eventType = "cancelled";
        } else if (details.url.includes('atualizaHorario.php')) {
            const formData = details.requestBody?.formData;
            if (formData && formData.tipo) {
                const tipo = formData.tipo[0];
                if (tipo === "5") {
                    eventType = "confirmed";
                } else if (tipo === "8") {
                    eventType = "showed";
                } else if (tipo === "1") {
                    eventType = "noshow";
                } else {
                    eventType = "status_update";
                }
            } else {
                eventType = "status_update";
            }
        } else {
            // Para outras URLs, não fazer nada (insereAgendamentov5.php é tratado pelo content.js)
            console.log('[WebRequest] URL não mapeada, ignorando');
            return;
        }
        
        if (details.method !== 'POST') {
            console.log('[WebRequest] Não é POST, ignorando');
            return;
        }
        
        const requestBody = details.requestBody || {};
        
        // Caso 1: formData (chave: valor[] )
        if (requestBody.formData && Object.keys(requestBody.formData).length > 0) {
            console.log('[WebRequest] Usando formData');
            const rawData = {};
            const rawPayloadParts = [];
            
            for (const [key, val] of Object.entries(requestBody.formData)) {
                const value = val[0] || '';
                rawData[key] = value;
                rawPayloadParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
            }
            
            const rawPayload = rawPayloadParts.join('&');
            const normalized = normalizarDados(rawData, eventType);
            
            console.log('[WebRequest] Dados normalizados:', normalized);
            enviarWebhook(eventType, normalized, rawPayload);
            return;
        }
        
        // Caso 2: raw body (ArrayBuffer[])
        if (requestBody.raw && requestBody.raw.length > 0) {
            console.log('[WebRequest] Usando raw body');
            try {
                const decoder = new TextDecoder('utf-8');
                let rawString = '';
                for (const buffer of requestBody.raw) {
                    rawString += decoder.decode(buffer);
                }
                
                console.log('[WebRequest] Raw string decodificada:', rawString);
                
                const normalized = normalizarDados(rawString, eventType);
                console.log('[WebRequest] Dados normalizados (raw):', normalized);
                enviarWebhook(eventType, normalized, rawString);
            } catch (e) {
                console.error('[WebRequest] Erro ao decodificar raw body:', e);
            }
            return;
        }
        
        console.log('[WebRequest] Nenhum body encontrado');
    },
    {
        urls: [
            "https://sistema.appbarber.com.br/pages/cadastros/alteraAgendamento.php",
            "https://sistema.appbarber.com.br/pages/actions/cancelaHorario.php",
            "https://sistema.appbarber.com.br/pages/actions/atualizaHorario.php"
        ]
    },
    ["requestBody"]
);