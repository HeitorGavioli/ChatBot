// index.js

document.addEventListener('DOMContentLoaded', () => {
    const chatLog = document.getElementById('chat-log');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    // URLs do backend.
    const chatUrl = 'https://chatbot-liau.onrender.com/chat'; // Rota de chat principal
    const saveHistoryUrl = 'https://chatbot-liau.onrender.com/api/chat/salvar-historico';

    // Configurações da sessão
    const BOT_ID = "jorgebot_v1";
    let currentSessionId = `sessao_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    let chatStartTime = new Date();
    let chatHistory = []; // O histórico da conversa atual

    function addMessageToLog(message, sender) {
        const messageElement = document.createElement('div');
        const cssClass = sender === 'user' ? 'user-message' : (sender === 'error' ? 'error-message' : 'bot-message');
        messageElement.classList.add(cssClass);
        messageElement.textContent = message;
        chatLog.appendChild(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    async function salvarHistoricoCompleto() {
        // Esta função agora apenas salva a sessão inteira no final ou quando necessário
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
    // Adiciona a mensagem do usuário ao histórico local.
    // O histórico agora começa com a mensagem do usuário.
    chatHistory.push({ role: 'user', content: message });
    
    userInput.value = '';
    sendButton.disabled = true;
    addMessageToLog("Digitando...", 'bot');

    try {
        // CORREÇÃO CRUCIAL AQUI:
        // Enviamos o histórico completo. Como a mensagem de boas-vindas não é mais adicionada
        // ao `chatHistory` que vai para a IA, a primeira mensagem será sempre a do 'user'.
        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                mensagem: message,
                // Envia o histórico ANTES da mensagem atual do usuário.
                // A mensagem atual é o `userMessage` que o backend usará para iniciar o `sendMessage`.
                historico: chatHistory.slice(0, -1) 
            })
        });

        chatLog.removeChild(chatLog.lastChild); // Remove "Digitando..."

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.erro || `Erro no servidor: ${response.status}`);
        }

        const data = await response.json();
        addMessageToLog(data.resposta, 'bot');
        // Adiciona a resposta do bot ao histórico local para manter o contexto.
        chatHistory.push({ role: 'model', content: data.resposta });
        
        // Salva o histórico completo no MongoDB.
        salvarHistoricoCompleto();

    } catch (error) {
        if (chatLog.lastChild?.textContent === "Digitando...") {
            chatLog.removeChild(chatLog.lastChild);
        }
        console.error('Erro ao processar mensagem:', error);
        const errorMessage = `Desculpe, ocorreu um erro: ${error.message}`;
        addMessageToLog(errorMessage, 'error');
        // Remove a última mensagem do usuário do histórico se houve erro, para que ele possa tentar de novo.
        chatHistory.pop();
    } finally {
        sendButton.disabled = false;
        userInput.focus();
    }
}
    
function iniciarChat() {
    const welcomeMessage = "Olá! Eu sou o JorgeBot. Como posso te ajudar hoje? Posso verificar o clima e te dizer as horas!";
    addMessageToLog(welcomeMessage, 'bot');
    // NÃO adicionamos mais a mensagem de boas-vindas ao `chatHistory`.
    // O histórico começará vazio e a primeira coisa a ser adicionada será a primeira mensagem do usuário.
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



