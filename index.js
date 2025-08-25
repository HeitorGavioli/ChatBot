document.addEventListener('DOMContentLoaded', () => {
    const chatLog = document.getElementById('chat-log');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    // URL do backend. Não precisa mudar para localhost.
    const apiUrl = 'https://chatbot-liau.onrender.com/chat';
    const saveHistoryUrl = 'https://chatbot-liau.onrender.com/api/chat/salvar-historico';

    // Configurações da sessão
    const BOT_ID = "jorgebot_v1";
    let currentSessionId = `sessao_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    let chatStartTime = new Date();
    let chatHistory = [];

    function addMessageToLog(message, sender) {
        const messageElement = document.createElement('div');
        const cssClass = sender === 'user' ? 'user-message' : (sender === 'error' ? 'error-message' : 'bot-message');
        messageElement.classList.add(cssClass);
        messageElement.textContent = message;
        chatLog.appendChild(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    async function salvarHistoricoSessao() {
        try {
            const payload = {
                sessionId: currentSessionId,
                botId: BOT_ID,
                startTime: chatStartTime.toISOString(),
                endTime: new Date().toISOString(),
                messages: chatHistory
            };
            await fetch(saveHistoryUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.error("Erro ao salvar histórico:", error);
        }
    }

    async function sendMessageToBackend(message) {
        addMessageToLog(message, 'user');
        chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
        userInput.value = '';
        sendButton.disabled = true;
        addMessageToLog("Digitando...", 'bot');

        try {
            const chatResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mensagem: message })
            });

            chatLog.removeChild(chatLog.lastChild); // Remove "Digitando..."

            if (!chatResponse.ok) {
                const errorData = await chatResponse.json();
                throw new Error(errorData.erro || `Erro no servidor: ${chatResponse.status}`);
            }

            const data = await chatResponse.json();
            addMessageToLog(data.resposta, 'bot');
            chatHistory.push({ role: 'bot', content: data.resposta, timestamp: new Date().toISOString() });
            
            salvarHistoricoSessao();

        } catch (error) {
            if (chatLog.lastChild?.textContent === "Digitando...") {
                chatLog.removeChild(chatLog.lastChild);
            }
            console.error('Erro ao processar mensagem:', error);
            addMessageToLog(`Desculpe, ocorreu um erro: ${error.message}`, 'error');
            chatHistory.push({ role: 'error', content: error.message, timestamp: new Date().toISOString() });
        } finally {
            sendButton.disabled = false;
            userInput.focus();
        }
    }

    function iniciarChat() {
        const welcomeMessage = "Olá! Eu sou o JorgeBot. Como posso te ajudar hoje?";
        addMessageToLog(welcomeMessage, 'bot');
        chatHistory.push({ role: 'bot', content: welcomeMessage, timestamp: new Date().toISOString() });
    }

    sendButton.addEventListener('click', () => {
        const message = userInput.value.trim();
        if (message) sendMessageToBackend(message);
    });

    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendButton.click();
        }
    });

    iniciarChat();

});