document.addEventListener('DOMContentLoaded', () => {
    const chatLog = document.getElementById('chat-log');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    const chatUrl = 'https://chatbot-liau.onrender.com/chat';
    let chatHistory = [];

    function addMessageToLog(message, sender) {
        const p = document.createElement('p');
        p.textContent = message;
        p.className = `${sender}-message`;
        chatLog.appendChild(p);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    async function sendMessageToBackend(message) {
        addMessageToLog(message, 'user');
        chatHistory.push({ role: 'user', content: message });
        userInput.value = '';
        sendButton.disabled = true;
        addMessageToLog("Digitando...", 'bot');

        const token = localStorage.getItem('token'); // Pega o token do storage
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`; // Adiciona o token ao cabeçalho
        }

        try {
            const response = await fetch(chatUrl, {
                method: 'POST',
                headers: headers, // Usa os cabeçalhos com o token
                body: JSON.stringify({ mensagem: message, historico: chatHistory.slice(0, -1) })
            });

            chatLog.removeChild(chatLog.lastChild);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.erro || `Erro: ${response.status}`);
            }

            const data = await response.json();
            addMessageToLog(data.resposta, 'bot');
            chatHistory.push({ role: 'model', content: data.resposta });

        } catch (error) {
            if (chatLog.lastChild?.textContent === "Digitando...") {
                chatLog.removeChild(chatLog.lastChild);
            }
            addMessageToLog(`Desculpe, erro: ${error.message}`, 'error');
            chatHistory.pop();
        } finally {
            sendButton.disabled = false;
            userInput.focus();
        }
    }

    sendButton.addEventListener('click', () => {
        const message = userInput.value.trim();
        if (message) sendMessageToBackend(message);
    });

    userInput.addEventListener('keypress', e => e.key === 'Enter' && sendButton.click());

    addMessageToLog("Olá! Eu sou o JorgeBot. Como posso te ajudar?", 'bot');
});
