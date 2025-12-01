document.addEventListener('DOMContentLoaded', () => {
    const chatLog = document.getElementById('chat-log');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const chatUrl = 'https://chatbot-liau.onrender.com/chat';
    
    let chatHistory = [];

    function addMessageToLog(message, sender) {
        const p = document.createElement('p');
        p.textContent = message;
        p.className = `${sender}-message`; // Use classes simples para estilização
        chatLog.appendChild(p);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    async function sendMessageToBackend(message) {
        addMessageToLog(message, 'user');
        chatHistory.push({ role: 'user', content: message });
        userInput.value = '';
        sendButton.disabled = true;
        addMessageToLog("Digitando...", 'bot');

        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`; // Anexa o token se ele existir
        }

        try {
            const response = await fetch(chatUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ 
                    mensagem: message,
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
            chatHistory.push({ role: 'bot', content: data.resposta });

        } catch (error) {
            if (chatLog.lastChild?.textContent === "Digitando...") {
                chatLog.removeChild(chatLog.lastChild);
            }
            addMessageToLog(`Desculpe, ocorreu um erro: ${error.message}`, 'error');
            chatHistory.pop(); // Remove a mensagem do usuário do histórico se deu erro
        } finally {
            sendButton.disabled = false;
            userInput.focus();
        }
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

    addMessageToLog("Olá! Eu sou o Jorge. Como posso te ajudar hoje?", 'bot');
});

