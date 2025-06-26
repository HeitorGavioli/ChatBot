// script.js

const chatLog = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

// URL base do seu backend Node.js (ajuste a porta se necessário)
const backendUrl = 'http://localhost:3000'; 
const apiUrl = `${backendUrl}/chat`;

// NOME DO SEU BOT (defina aqui)
const NOME_DO_BOT = "IFCODE SuperBot"; // <-- Altere aqui se quiser
let currentSessionId = `sessao_${Date.now()}_${Math.random().toString(36).substring(7)}`;
let chatStartTime = new Date();

// ... (código das funções addMessageToLog e sendMessageToBackend permanece o mesmo) ...
function addMessageToLog(message, sender) {
    const messageElement = document.createElement('p');
    messageElement.textContent = message;

    // Adiciona classe CSS baseada em quem enviou (user, bot, error)
    if (sender === 'user') {
        messageElement.classList.add('user-message');
    } else if (sender === 'bot') {
        messageElement.classList.add('bot-message');
    } else if (sender === 'error') {
        messageElement.classList.add('error-message');
    } else {
        messageElement.classList.add('bot-message'); // Padrão para bot
    }

    chatLog.appendChild(messageElement);

    // Auto-scroll para a última mensagem
    chatLog.scrollTop = chatLog.scrollHeight;
}

// Variável para armazenar o histórico da conversa
let chatHistory = [];

// Função para enviar a mensagem para o backend
async function sendMessageToBackend(message) {
    // Mostra a mensagem do usuário imediatamente
    addMessageToLog(message, 'user');
    userInput.value = ''; // Limpa o input
    sendButton.disabled = true; // Desabilita o botão enquanto espera a resposta

    try {
        // First await the history saving
        await salvarHistoricoSessao(currentSessionId, "chatbotPrincipalIFCODE", chatStartTime, new Date(), chatHistory);
        
        const payload = {
            sessionId: currentSessionId, // Using the variable that appears to be in scope
            botId: "chatbotPrincipalIFCODE", // Using the same ID as above
            startTime: chatStartTime.toISOString(), // Using the variable that appears to be in scope
            endTime: new Date().toISOString(),
            messages: chatHistory // Using the variable that appears to be in scope
        };

        const response = await fetch(`${backendUrl}/api/chat/salvar-historico`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Falha ao salvar histórico:", errorData.error || response.statusText);
        } else {
            const result = await response.json();
            console.log("Histórico de sessão enviado:", result.message);
        }
    } catch (error) {
        console.error("Erro ao enviar histórico de sessão:", error);
    } finally {
        sendButton.disabled = false; // Reabilita o botão
        userInput.focus(); // Coloca o foco de volta no input
    }
}


sendButton.addEventListener('click', () => {
    const message = userInput.value.trim();
    if (message) { // Só envia se não estiver vazio
        sendMessageToBackend(message);
    }
});

// Enviar mensagem ao pressionar Enter no input
userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Impede o comportamento padrão do Enter (ex: submit de formulário)
        const message = userInput.value.trim();
        if (message) {
            sendMessageToBackend(message);
        }
    }
});


// --- NOVAS FUNÇÕES DE LOG E RANKING (ATUALIZADAS) ---

// Função para registrar o acesso inicial e para o ranking
async function registrarAcoesIniciais() {
    console.log("Iniciando registros de acesso...");
    try {
        // 1. Obter informações do usuário (IP)
        const userInfoResponse = await fetch(`${backendUrl}/api/user-info`);
        if (!userInfoResponse.ok) {
            throw new Error('Falha ao obter info do usuário.');
        }
        const userInfo = await userInfoResponse.json();
        console.log("Info do usuário obtida:", userInfo);

        // 2. Registrar o log de conexão no MongoDB (ATUALIZADO)
        const logData = {
            ip: userInfo.ip,
            acao: "acesso_inicial_chatbot",
            nomeBot: NOME_DO_BOT // ATUALIZAÇÃO: Enviando o nome do bot
        };
        const logResponse = await fetch(`${backendUrl}/api/log-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logData)
        });
        if (!logResponse.ok) {
            console.error("Falha ao registrar log de conexão:", await logResponse.text());
        } else {
            console.log("Log de conexão registrado com sucesso.");
        }

        // 3. Registrar o acesso para o sistema de ranking
        const dataRanking = {
            botId: "chatbotPrincipalIFCODE",
            nomeBot: NOME_DO_BOT, // Usando a mesma variável para consistência
            timestampAcesso: new Date().toISOString()
        };
        const rankingResponse = await fetch(`${backendUrl}/api/ranking/registrar-acesso-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataRanking)
        });

        if (!rankingResponse.ok) {
            console.error("Falha ao registrar acesso para ranking:", await rankingResponse.text());
        } else {
            const result = await rankingResponse.json();
            console.log("Registro de ranking enviado:", result.message);
        }

    } catch (error) {
        console.error("Erro durante os registros iniciais:", error);
    }
}

// --- Inicialização ---
userInput.focus(); // Coloca o foco no input ao carregar a página
window.addEventListener('load', registrarAcoesIniciais);

// ... (código dos event listeners e outras funções) ...