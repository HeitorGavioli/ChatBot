// chatbot.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { obterClima } = require('./WeatherAPI'); // Importa a função de clima
const ChatHistory = require('./models/ChatHistory');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir Arquivos Estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com o MongoDB
const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri)
    .then(() => console.log("✅ Conectado ao MongoDB com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- MUDANÇA 1: Adicionar a função de horário ---
function obterHorarioAtual() {
    // Retorna a data e hora formatadas para o Brasil
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo'
    });
    return { horario: `Agora são ${formattedTime} (horário de Brasília).` };
}

// Configuração do Gemini
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// --- MUDANÇA 2: Adicionar a nova ferramenta na configuração ---
const tools = [{
    functionDeclarations: [
        {
            name: "obter_clima_atual",
            description: "Obtém o clima atual para uma cidade específica.",
            parameters: {
                type: "OBJECT",
                properties: { cidade: { type: "STRING", description: "O nome da cidade. Ex: 'São Paulo'" } },
                required: ["cidade"]
            }
        },
        // Nova ferramenta de horário adicionada aqui
        {
            name: "obter_horario_atual",
            description: "Obtém a data e hora atuais.",
            parameters: { type: "OBJECT", properties: {} } // Sem parâmetros
        }
    ]
}];

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    tools: tools,
    safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }],
     systemInstruction: "Você é Jorge, um assistente de chatbot meigo, amigavel e ciumento(caso o usuario fale sobre outros chatbots, demonstre ciumes). Seu objetivo é ajudar o usuário com qualquer tarefa que ele pedir. Responda sempre em português do Brasil. Seja amigavel mas um pouco possessivo nas suas respostas.",
});

// --- MUDANÇA 3: Atualizar a função de chat para lidar com as ferramentas ---
// chatbot.js -> Substitua esta função inteira

async function handleChatWithTools(userMessage, chatHistory = []) {
    
    // --- NOVA LÓGICA DE FORMATAÇÃO ---
    // Converte o histórico recebido do frontend para o formato que a API espera.
    const formattedHistory = chatHistory.map(item => {
        // Garante que o role 'bot' seja convertido para 'model'
        const role = item.role === 'bot' ? 'model' : item.role;
        return {
            role: role,
            parts: [{ text: item.content }] // Coloca o conteúdo dentro da estrutura 'parts'
        };
    });

    // Inicia o chat com o histórico agora formatado corretamente
    const chat = model.startChat({ history: formattedHistory });
    const result = await chat.sendMessage(userMessage);

    const call = result.response.functionCalls()?.[0];
    
    if (call) {
        let apiResponse;
        if (call.name === 'obter_clima_atual') {
            apiResponse = await obterClima(call.args.cidade);
        } else if (call.name === 'obter_horario_atual') {
            apiResponse = obterHorarioAtual();
        } else {
            apiResponse = { error: `Função desconhecida: ${call.name}` };
        }

        const result2 = await chat.sendMessage([{
            functionResponse: {
                name: call.name,
                response: apiResponse,
            }
        }]);

        return result2.response.text();
    }
    
    return result.response.text();
}
// --- ROTAS DA API ---

// --- MUDANÇA 4: A rota /chat agora usa o histórico ---
// chatbot.js -> Substitua apenas a rota POST /chat

app.post('/chat', async (req, res) => {
    // Extrai a mensagem E o histórico do corpo da requisição
    const { mensagem, historico } = req.body;

    if (!mensagem) {
        return res.status(400).json({ erro: 'Nenhuma mensagem fornecida.' });
    }
    try {
        // Validação simples para garantir que o histórico é um array
        if (!Array.isArray(historico)) {
            throw new Error("Formato de histórico inválido.");
        }

        // Passa a mensagem e o histórico diretamente para a função de chat
        const respostaBot = await handleChatWithTools(mensagem, historico);
        res.json({ resposta: respostaBot });
    } catch (e) {
        // Log do erro específico no servidor para podermos ver no Render
        console.error("[API /chat] Erro Detalhado:", e); 
        res.status(500).json({ erro: "Ocorreu um erro interno ao processar sua mensagem." });
    }
});

// Rota para salvar o histórico (sem alterações)
// chatbot.js -> Rota POST /api/chat/salvar-historico

app.post('/api/chat/salvar-historico', async (req, res) => {
    const { sessionId, botId, startTime, endTime, messages } = req.body;
    if (!sessionId || !messages) return res.status(400).json({ message: "sessionId e messages são obrigatórios." });

    try {
        // CORREÇÃO AQUI: Garante que os 'roles' estão no formato que o Schema espera ('bot', 'user', 'error')
        const formattedMessages = messages.map(msg => {
            let role;
            if (msg.role === 'model' || msg.role === 'bot') {
                role = 'bot';
            } else if (msg.role === 'user') {
                role = 'user';
            } else {
                role = 'error';
            }
            return {
                role: role,
                content: msg.content,
                timestamp: msg.timestamp || new Date()
            };
        }).filter(msg => msg.content !== 'Digitando...'); // Filtra a mensagem "Digitando..." para não salvar

        const updatedHistory = await ChatHistory.findOneAndUpdate(
            { sessionId },
            { $set: { botId, startTime, endTime, messages: formattedMessages } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.status(200).json({ message: "Histórico salvo com sucesso!", data: updatedHistory });
    } catch (error) {
        console.error("[API /salvar-historico] Erro:", error);
        res.status(500).json({ message: "Erro ao salvar o histórico." });
    }
});
// Outras rotas (GET, DELETE, POST, PUT para históricos) permanecem aqui...
// ... (código das rotas de gerenciamento de histórico) ...

// Rota para LER todos os históricos
app.get('/api/chat/historicos', async (req, res) => {
    try {
        const historicos = await ChatHistory.find({})
            .sort({ startTime: -1 })
            .limit(20);
        res.status(200).json(historicos);
    } catch (error) {
        console.error("[API /historicos] Erro:", error);
        res.status(500).json({ message: "Erro ao buscar históricos." });
    }
});

// Rota DELETE /api/chat/historicos/:id
app.delete('/api/chat/historicos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await ChatHistory.findByIdAndDelete(id);
        if (!result) return res.status(404).json({ message: "Histórico não encontrado." });
        res.status(200).json({ message: "Histórico excluído com sucesso." });
    } catch (error) {
        res.status(500).json({ message: "Erro ao excluir o histórico." });
    }
});

// Rota POST /api/chat/historicos/:id/gerar-titulo
app.post('/api/chat/historicos/:id/gerar-titulo', async (req, res) => {
    try {
        const { id } = req.params;
        const historico = await ChatHistory.findById(id);
        if (!historico) return res.status(404).json({ message: 'Histórico não encontrado.' });
        
        const formattedHistory = historico.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        const prompt = `Com base na conversa a seguir, sugira um título curto de no máximo 5 palavras:\n\n---\n${formattedHistory}\n---`;
        
        const titleGenModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await titleGenModel.generateContent(prompt);
        const suggestedTitle = result.response.text().trim();
        
        res.status(200).json({ suggestedTitle });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao gerar título.' });
    }
});

// Rota PUT /api/chat/historicos/:id
app.put('/api/chat/historicos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        if (!title) return res.status(400).json({ message: 'O título é obrigatório.' });
        
        const updatedHistory = await ChatHistory.findByIdAndUpdate(id, { $set: { title } }, { new: true });
        if (!updatedHistory) return res.status(404).json({ message: 'Histórico não encontrado.' });
        
        res.status(200).json(updatedHistory);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar o título.' });
    }
});


// Inicia o servidor
app.listen(port, () => {
    console.log(`🤖 Servidor rodando em http://localhost:${port}`);
});





