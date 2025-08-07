document.addEventListener('DOMContentLoaded', () => {
    const listaSessoesEl = document.getElementById('lista-sessoes');
    const visualizacaoConversaEl = document.getElementById('visualizacao-conversa');
    
    // URL do backend. Não precisa mudar para localhost.
    const historicosUrl = '/api/chat/historicos';

    function exibirConversaDetalhada(mensagens) {
        visualizacaoConversaEl.innerHTML = ''; // Limpa a visualização

        if (!mensagens || mensagens.length === 0) {
            visualizacaoConversaEl.innerHTML = '<p class="placeholder">Esta sessão não contém mensagens.</p>';
            return;
        }

        mensagens.forEach(msg => {
            const messageElement = document.createElement('div');
            const cssClass = msg.role === 'user' ? 'user-message' : (msg.role === 'error' ? 'error-message' : 'bot-message');
            messageElement.classList.add(cssClass);
            messageElement.textContent = msg.content;
            visualizacaoConversaEl.appendChild(messageElement);
        });
        visualizacaoConversaEl.scrollTop = 0;
    }

    async function carregarHistoricos() {
        try {
            const response = await fetch(historicosUrl);
            if (!response.ok) throw new Error(`Erro na rede: ${response.statusText}`);
            
            const historicosData = await response.json();
            listaSessoesEl.innerHTML = ''; // Limpa "carregando"

            if (historicosData.length === 0) {
                listaSessoesEl.innerHTML = '<li>Nenhum histórico encontrado.</li>';
                return;
            }

            historicosData.forEach((historico, index) => {
                const li = document.createElement('li');
                li.textContent = `Conversa de ${new Date(historico.startTime).toLocaleString('pt-BR')}`;
                
                li.addEventListener('click', () => {
                    document.querySelectorAll('#lista-sessoes li').forEach(item => item.classList.remove('active'));
                    li.classList.add('active');
                    exibirConversaDetalhada(historico.messages);
                });

                listaSessoesEl.appendChild(li);
            });

        } catch (error) {
            console.error("Falha ao carregar históricos:", error);
            listaSessoesEl.innerHTML = `<li>Erro ao carregar dados. Tente novamente.</li>`;
        }
    }

    carregarHistoricos();
});