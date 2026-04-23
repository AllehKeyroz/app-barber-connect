// content.js - Roda no ISOLATED world (contexto da extensão)
// Escuta mensagens do inject.js e repassa para o background.js

console.log('[Content] Script carregado');

window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) {
        return;
    }
    
    // Intercept com resposta (para new - request + response do insereAgendamentov5.php)
    if (event.data.type === 'APPBARBER_INTERCEPT_WITH_RESPONSE') {
        console.log('[Content] Recebido intercept com resposta:', event.data);
        chrome.runtime.sendMessage({
            action: "intercepted_scheduling_with_response",
            data: event.data.payload,
            url: event.data.url,
            response: event.data.response
        });
        return;
    }
});