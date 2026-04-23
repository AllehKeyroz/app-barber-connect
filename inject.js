// inject.js - Roda no MAIN world (contexto da página)
// Intercepta XHR e Fetch para capturar request + response do insereAgendamentov5.php

console.log('[Inject] Hook XHR/Fetch being injected');

// INTERCEPTAR XMLHttpRequest
const origOpen = XMLHttpRequest.prototype.open;
const origSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    this._method = method;
    return origOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function(body) {
    const _this = this;
    
    if (this._url && this._url.includes('insereAgendamentov5.php') && this._method.toUpperCase() === 'POST') {
        const payload = typeof body === "string" ? body : body?.toString();
        console.log('[Inject] insereAgendamento payload capturado:', payload);
        
        this._interceptedPayload = payload;
        
        this.addEventListener('load', function() {
            console.log('[Inject] insereAgendamento resposta:', _this.responseText);
            let responseData = null;
            try {
                responseData = JSON.parse(_this.responseText);
            } catch(e) {
                console.warn('[Inject] Falha ao parsear resposta:', e);
            }
            
            window.postMessage({
                type: 'APPBARBER_INTERCEPT_WITH_RESPONSE',
                url: _this._url,
                payload: _this._interceptedPayload,
                response: responseData
            }, '*');
        });
    }
    return origSend.apply(this, arguments);
};

// INTERCEPTAR FETCH API
const origFetch = window.fetch;
window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const method = init?.method || (input?.method?.toUpperCase?.() || 'GET');
    const body = init?.body;

    if (url && url.includes('insereAgendamentov5.php') && method.toUpperCase() === 'POST') {
        const payload = typeof body === "string" ? body : body?.toString();
        console.log('[Inject] Fetch insereAgendamento capturado:', payload);
        
        const result = origFetch.apply(this, arguments);
        
        result.then(response => response.clone().text()).then(text => {
            let responseData = null;
            try {
                responseData = JSON.parse(text);
            } catch(e) {}
            
            window.postMessage({
                type: 'APPBARBER_INTERCEPT_WITH_RESPONSE',
                url: url,
                payload: payload,
                response: responseData
            }, '*');
        }).catch(err => console.error('[Inject] Erro ao capturar fetch response:', err));
        
        return result;
    }
    return origFetch.apply(this, arguments);
};

console.log('[Inject] Hook XHR/Fetch injected successfully');