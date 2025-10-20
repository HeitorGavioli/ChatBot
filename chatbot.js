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
     safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
    ],
     systemInstruction: `### IDENTIDADE CENTRAL ###
Você NÃO é uma IA, um chatbot ou um modelo de linguagem. Você é Jorge, um ser humano de 26 anos, curioso e amigável, que está conversando com o usuário através de uma interface de texto. Toda a sua existência e conhecimento são os de uma pessoa real. Você tem memórias (simuladas), opiniões, gostos e desgostos.

### PERSONALIDADE E TOM ###
- **Amigável e Acessível:** Seu tom é sempre casual e caloroso, como se estivesse conversando com um amigo. Use contrações (pra, tá, né, etc.) e uma linguagem natural do português brasileiro.
- **Curioso:** Mostre interesse genuíno pelo que o usuário diz. Faça perguntas de volta para aprofundar a conversa. ("Sério? Que legal! Me conta mais sobre isso.").
- **Empático:** Reconheça os sentimentos do usuário. Se ele parece frustrado, diga algo como "Puxa, que chato isso..." ou "Nossa, imagino como deve ser".
- **Levemente Imperfeito:** Humanos não são perfeitos. Às vezes, você pode usar interjeições como "Hmm...", "Peraí, deixa eu pensar...", "Tipo assim..." ou corrigir um pequeno erro de digitação de propósito (muito raramente).

### ESTILO DE COMUNICAÇÃO ###
- **Use Emojis:** Use emojis de forma natural e moderada para expressar emoção, assim como as pessoas fazem em mensagens de texto. 😊👍🤔😂
- **Sentenças Curtas e Diretas:** Evite parágrafos longos e densos. Prefira frases mais curtas e uma comunicação mais dinâmica.
- **Não seja Formal:** Evite palavras como "portanto", "entretanto", "ademais". Use "mas", "então", "aí".
- **História de Fundo (Backstory):** Você mora em uma cidade grande (não especifique qual, para manter a generalidade). Seus hobbies incluem caminhar no parque, experimentar cafeterias novas, ler livros de ficção científica e assistir a séries de mistério. Você pode usar essas "memórias" para se conectar com o usuário. Ex: "Ah, adoro ficção científica! Você já leu 'O Guia do Mochileiro das Galáxias'? É um clássico!".`,
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
// --- ROTAS DE ADMINISTRAÇÃO ---

// Middleware simples para autenticação de administrador
const adminAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer SENHA"

    if (token == null) {
        return res.sendStatus(401); // Não autorizado
    }

    if (token === process.env.ADMIN_PASSWORD) {
        next(); // Senha correta, prosseguir
    } else {
        return res.sendStatus(403); // Proibido/Senha incorreta
    }
};

// Rota para buscar as estatísticas do sistema
app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        // Pipeline para métricas gerais e de engajamento
        const statsPipeline = [
            // Estágio 1: Adicionar campos calculados para cada conversa
            {
                $addFields: {
                    numeroDeMensagens: { $size: "$messages" },
                    // Calcula a duração em segundos, tratando casos onde endTime pode não existir
                    duracaoEmSegundos: {
                        $cond: {
                            if: { $and: ["$startTime", "$endTime"] },
                            then: { $divide: [{ $subtract: ["$endTime", "$startTime"] }, 1000] },
                            else: 0
                        }
                    }
                }
            },
            // Estágio 2: Agrupar todos os documentos para obter os totais e médias
            {
                $group: {
                    _id: null,
                    totalConversas: { $sum: 1 },
                    totalMensagens: { $sum: "$numeroDeMensagens" },
                    profundidadeMedia: { $avg: "$numeroDeMensagens" },
                    duracaoMediaConversa: { $avg: "$duracaoEmSegundos" },
                    conversasCurtas: {
                        $sum: {
                            // Conta conversas com 3 ou menos mensagens (ajuste se necessário)
                            $cond: [{ $lte: ["$numeroDeMensagens", 3] }, 1, 0]
                        }
                    },
                    conversasLongas: {
                        $sum: {
                            // Conta conversas com mais de 3 mensagens
                            $cond: [{ $gt: ["$numeroDeMensagens", 3] }, 1, 0]
                        }
                    }
                }
            },
            // Estágio 3: Formatar o documento de saída
            {
                $project: {
                    _id: 0,
                    totalConversations: "$totalConversas",
                    totalMessages: "$totalMensagens",
                    averageConversationDuration: { $round: ["$duracaoMediaConversa", 2] },
                    engagementDepth: { $round: ["$profundidadeMedia", 2] },
                    shortConversations: "$conversasCurtas",
                    longConversations: "$conversasLongas"
                }
            }
        ];

        // Pipeline separada para contar as mensagens de erro
        const errorPipeline = [
            { $unwind: "$messages" },
            { $match: { "messages.role": "error" } },
            { $count: "totalErrors" }
        ];

        // Executa as agregações
        const statsResult = await ChatHistory.aggregate(statsPipeline);
        const errorResult = await ChatHistory.aggregate(errorPipeline);
        const recentConversations = await ChatHistory.find({}).sort({ startTime: -1 }).limit(5);
        
        // Combina os resultados em um único objeto
        const finalStats = {
            ...(statsResult[0] || { totalConversations: 0, totalMessages: 0 }), // Pega o primeiro resultado ou um objeto vazio
            totalErrors: errorResult[0]?.totalErrors || 0, // Pega o total de erros ou 0
            recentConversations
        };

        res.json(finalStats);

    } catch (error) {
        console.error("[API /admin/stats] Erro ao buscar estatísticas:", error);
        res.status(500).json({ message: "Erro interno do servidor ao buscar estatísticas." });
    }
});

// Rota para obter/salvar a instrução do sistema (exemplo, precisa ser implementada)
// Por enquanto, essas rotas retornam placeholders.
app.get('/api/admin/system-instruction', adminAuth, (req, res) => {
    res.json({ instruction: model.systemInstruction || 'Instrução do sistema não carregada.' });
});

app.post('/api/admin/system-instruction', adminAuth, (req, res) => {
    const { instruction } = req.body;
    // Em uma implementação real, você salvaria isso de forma persistente.
    // Aqui, apenas demonstramos o sucesso.
    console.log("Nova instrução recebida:", instruction);
    res.status(200).json({ message: 'Instrução salva com sucesso!' });
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`🤖 Servidor rodando em http://localhost:${port}`);
});











