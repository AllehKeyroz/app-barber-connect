document.addEventListener('DOMContentLoaded', async () => {
    const tokenValue = document.getElementById('tokenValue');
    const lastSyncTime = document.getElementById('lastSyncTime');
    const forceSendBtn = document.getElementById('forceSendBtn');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const syncStatus = document.getElementById('syncStatus');

    // Inicializa a interface com informações salvas
    function loadData() {
        chrome.storage.local.get(['lastCookieValue', 'lastSyncTimestamp'], (data) => {
            if (data.lastCookieValue) {
                // Se o token for mt grande, apenas corta e mostra o inicio e o fim.
                tokenValue.textContent = data.lastCookieValue.length > 25 
                    ? data.lastCookieValue.substring(0, 10) + '..........' + data.lastCookieValue.slice(-10) 
                    : data.lastCookieValue;
                
                syncStatus.textContent = "Conectado";
                syncStatus.style.color = "#4ade80";
            } else {
                tokenValue.textContent = "Nenhuma conexão estabelecida";
                syncStatus.textContent = "Aguardando";
                syncStatus.style.color = "#94a3b8";
            }
            
            if (data.lastSyncTimestamp) {
                const date = new Date(data.lastSyncTimestamp);
                lastSyncTime.textContent = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
        });
    }

    loadData();

    // Escuta modificações no storage (ex: se no background for coletado automático com o popup aberto)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.lastCookieValue || changes.lastSyncTimestamp)) {
            loadData();
        }
    });

    // Ação do Botão
    forceSendBtn.addEventListener('click', () => {
        forceSendBtn.disabled = true;
        forceSendBtn.textContent = "Atualizando...";
        feedbackMessage.textContent = "";

        // Manda mensagem pedindo pro script do background forçar envio
        chrome.runtime.sendMessage({ action: "forceSendCookie" }, (response) => {
            forceSendBtn.disabled = false;
            forceSendBtn.textContent = "Sincronizar Conexão";
            
            if (chrome.runtime.lastError) {
                feedbackMessage.style.color = "#f87171";
                feedbackMessage.textContent = "✖ Erro: Conexão interrompida. Recarregue a extensão.";
                syncStatus.textContent = "Desconectado";
                syncStatus.style.color = "#f87171";
            } else if (response && response.success) {
                feedbackMessage.style.color = "#4ade80";
                feedbackMessage.textContent = "✔ Sincronizado com sucesso!";
                syncStatus.textContent = "Sincronizado";
                syncStatus.style.color = "#4ade80";
            } else {
                feedbackMessage.style.color = "#f87171";
                feedbackMessage.textContent = "✖ Falha na integração (" + (response?.error || 'Aba do sistema não encontrada') + ")";
                syncStatus.textContent = "Erro na sincronia";
                syncStatus.style.color = "#f87171";
            }

            // limpa feedback dps de 5s
            setTimeout(() => {
                feedbackMessage.textContent = "";
            }, 5000);
        });
    });
});
