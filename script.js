const chatLog = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatContainer = document.getElementById('chat-container'); // Para scroll

// URL do seu backend Node.js (ajuste a porta se necessário)
const apiUrl = 'https://chatbot-liau.onrender.com/';

// --- Funções Auxiliares ---

// Função para adicionar uma mensagem ao log do chat
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

// Função para enviar a mensagem para o backend
async function sendMessageToBackend(message) {
    // Mostra a mensagem do usuário imediatamente
    addMessageToLog(message, 'user');
    userInput.value = ''; // Limpa o input
    sendButton.disabled = true; // Desabilita o botão enquanto espera a resposta

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mensagem: message }), // Envia no formato esperado pelo backend
        });

        if (!response.ok) {
            // Se a resposta não for OK (ex: erro 400, 500)
            throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Mostra a resposta do bot
        addMessageToLog(data.resposta, 'bot');

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        // Mostra uma mensagem de erro no chat
        addMessageToLog(`Erro ao conectar com o bot. Tente novamente. (${error.message})`, 'error');
    } finally {
        sendButton.disabled = false; // Reabilita o botão
        userInput.focus(); // Coloca o foco de volta no input
    }
}

// --- Event Listeners ---

// Enviar mensagem ao clicar no botão
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

// --- Inicialização (opcional) ---
userInput.focus(); // Coloca o foco no input ao carregar a página
