const chatLog = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

// URL base do seu backend Node.js
const backendUrl = 'https://chatbot-liau.onrender.com/'; 
const apiUrl = `${backendUrl}/chat`;

// Configurações do Bot
const NOME_DO_BOT = "IFCODE SuperBot";
const BOT_ID = "chatbotPrincipalIFCODE";
let currentSessionId = `sessao_${Date.now()}_${Math.random().toString(36).substring(7)}`;
let chatStartTime = new Date();
let chatHistory = [];

// Função para adicionar mensagem ao chat
function addMessageToLog(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = message;
    chatLog.appendChild(messageElement);
    chatLog.scrollTop = chatLog.scrollHeight;
}

// Função para salvar o histórico da sessão
async function salvarHistoricoSessao() {
    try {
        const payload = {
            sessionId: currentSessionId,
            botId: BOT_ID,
            startTime: chatStartTime.toISOString(),
            endTime: new Date().toISOString(),
            messages: chatHistory
        };

        const response = await fetch(`${backendUrl}/api/chat/salvar-historico`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Falha ao salvar histórico');
        }
        
        const result = await response.json();
        console.log("Histórico salvo:", result.message);
        return result;
    } catch (error) {
        console.error("Erro ao salvar histórico:", error);
        throw error;
    }
}

// Função principal para enviar mensagem ao backend
async function sendMessageToBackend(message) {
    // Adiciona mensagem do usuário ao chat e ao histórico
    addMessageToLog(message, 'user');
    chatHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });

    userInput.value = '';
    sendButton.disabled = true;

    try {
        // 1. Envia mensagem para o endpoint do chatbot
        const chatResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensagem: message })
        });

        if (!chatResponse.ok) {
            throw new Error(`Erro no servidor: ${chatResponse.status}`);
        }

        const data = await chatResponse.json();
        
        // 2. Adiciona resposta do bot ao chat e ao histórico
        addMessageToLog(data.resposta, 'bot');
        chatHistory.push({
            role: 'bot',
            content: data.resposta,
            timestamp: new Date().toISOString()
        });

        // 3. Salva o histórico atualizado
        await salvarHistoricoSessao();

    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        addMessageToLog('Desculpe, ocorreu um erro ao processar sua mensagem.', 'error');
    } finally {
        sendButton.disabled = false;
        userInput.focus();
    }
}

// Função para registrar ações iniciais
async function registrarAcoesIniciais() {
    try {
        // 1. Registrar acesso para ranking
        const rankingResponse = await fetch(`${backendUrl}/api/ranking/registrar-acesso-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                botId: BOT_ID,
                nomeBot: NOME_DO_BOT,
                timestampAcesso: new Date().toISOString()
            })
        });

        if (!rankingResponse.ok) {
            console.error("Falha no ranking:", await rankingResponse.text());
        }

        // 2. Mensagem de boas-vindas
        addMessageToLoad(`Olá! Eu sou o ${NOME_DO_BOT}. Como posso te ajudar hoje?`, 'bot');

    } catch (error) {
        console.error("Erro nos registros iniciais:", error);
    }
}

// Event Listeners
sendButton.addEventListener('click', () => {
    const message = userInput.value.trim();
    if (message) {
        sendMessageToBackend(message);
    }
});

userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        const message = userInput.value.trim();
        if (message) {
            sendMessageToBackend(message);
        }
    }
});

// Inicialização
window.addEventListener('load', () => {
    userInput.focus();
    registrarAcoesIniciais();
});
