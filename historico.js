document.addEventListener('DOMContentLoaded', () => {
    const listaSessoesEl = document.getElementById('lista-sessoes');
    const visualizacaoConversaEl = document.getElementById('visualizacao-conversa');
    
    // URL do backend. Não precisa mudar para localhost.
    const historicosUrl = 'https://chatbot-liau.onrender.com/api/chat/historicos';

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

     async function handleExcluirSessao(event) {
        event.stopPropagation(); // Impede que o clique no botão ative o clique no <li>
        const button = event.currentTarget;
        const sessionId = button.dataset.id;
        const liElement = button.closest('li');

        if (confirm('Tem certeza que deseja excluir esta conversa? Esta ação não pode ser desfeita.')) {
            try {
                const response = await fetch(`${historicosUrl}/${sessionId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error('Falha ao excluir. O servidor respondeu com status ' + response.status);
                }

                liElement.remove(); // Remove o item da tela
                // Limpa a visualização se a conversa excluída estava selecionada
                if (liElement.classList.contains('active')) {
                    visualizacaoConversaEl.innerHTML = '<p class="placeholder">Selecione uma sessão à esquerda para ver os detalhes.</p>';
                }

            } catch (error) {
                console.error("Erro ao excluir sessão:", error);
                alert("Não foi possível excluir a conversa. Tente novamente.");
            }
        }
    }

    async function handleGerarESalvarTitulo(event) {
        event.stopPropagation(); // Impede o clique de se propagar
        const button = event.currentTarget;
        const sessionId = button.dataset.id;
        const liElement = button.closest('li');
        const titleSpan = liElement.querySelector('.session-title');

        button.textContent = '🧠'; // Feedback de "pensando"
        button.disabled = true;

        try {
            // 1. Fazer fetch para obter a sugestão de título
            const responseGen = await fetch(`${historicosUrl}/${sessionId}/gerar-titulo`, { method: 'POST' });
            if (!responseGen.ok) throw new Error('Falha ao contatar a IA.');
            const { suggestedTitle } = await responseGen.json();

            // 2. Pedir confirmação/edição do usuário
            const finalTitle = prompt("Sugestão de título:", suggestedTitle);

            // 3. Se o usuário confirmou e o título não está vazio, salvar
            if (finalTitle && finalTitle.trim() !== '') {
                const responseSave = await fetch(`${historicosUrl}/${sessionId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: finalTitle })
                });

                if (!responseSave.ok) throw new Error('Falha ao salvar o novo título.');
                
                const updatedHistory = await responseSave.json();
                titleSpan.textContent = updatedHistory.title; // Atualiza o título na tela
            }
        } catch (error) {
            console.error("Erro no processo de titular:", error);
            alert("Ocorreu um erro: " + error.message);
        } finally {
            button.textContent = '✏️'; // Restaura o ícone original
            button.disabled = false;
        }
    }


    async function carregarHistoricos() {
        try {
            const response = await fetch(historicosUrl);
            if (!response.ok) throw new Error(`Erro na rede: ${response.statusText}`);
            
            const historicosData = await response.json();
            listaSessoesEl.innerHTML = '';

            if (historicosData.length === 0) {
                listaSessoesEl.innerHTML = '<li>Nenhum histórico encontrado.</li>';
                return;
            }

            // --- LÓGICA DE RENDERIZAÇÃO ATUALIZADA ---
            historicosData.forEach((historico) => {
                const li = document.createElement('li');
                li.dataset.id = historico._id; // Guardar o ID no próprio elemento
                
                // Estrutura interna do <li> com título e botões
                li.innerHTML = `
                    <div class="session-info">
                        <span class="session-title">${historico.title}</span>
                        <span class="session-date">${new Date(historico.startTime).toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="session-actions">
                        <button class="action-btn title-btn" data-id="${historico._id}" title="Gerar Título com IA">✏️</button>
                        <button class="action-btn delete-btn" data-id="${historico._id}" title="Excluir Conversa">🗑️</button>
                    </div>
                `;
                
                // Adiciona evento de clique para visualizar a conversa
                li.addEventListener('click', () => {
                    document.querySelectorAll('#lista-sessoes li').forEach(item => item.classList.remove('active'));
                    li.classList.add('active');
                    exibirConversaDetalhada(historico.messages);
                });

                // Adiciona eventos de clique para os botões de ação
                li.querySelector('.delete-btn').addEventListener('click', handleExcluirSessao);
                li.querySelector('.title-btn').addEventListener('click', handleGerarESalvarTitulo);

                listaSessoesEl.appendChild(li);
            });

        } catch (error) {
            console.error("Falha ao carregar históricos:", error);
            listaSessoesEl.innerHTML = `<li>Erro ao carregar dados. Tente novamente.</li>`;
        }
    }

    carregarHistoricos();

});
