require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { obterClima } = require('./WeatherAPI');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuração da Conexão com MongoDB Atlas ---
const mongoUriLogs = process.env.MONGO_URI_LOGS;
const mongoUriHistoria = process.env.MONGO_URI_HISTORIA;

let dbLogs;
let dbHistoria;

async function connectToMongoDB(uri, dbName) {
    if (!uri) {
        console.error(`URI do MongoDB para ${dbName} não definida!`);
        return null;
    }
    const client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });
    try {
        await client.connect();
        console.log(`Conectado ao MongoDB Atlas: ${dbName}`);
        return client.db(dbName);
    } catch (err) {
        console.error(`Falha ao conectar ao MongoDB ${dbName}:`, err);
        return null;
    }
}

async function initializeDatabases() {
    dbLogs = await connectToMongoDB(mongoUriLogs, "IIW2023B_Logs");
    dbHistoria = await connectToMongoDB(mongoUriHistoria, "chatbotHistoriaDB");
    
    if (!dbLogs || !dbHistoria) {
        console.error("Falha ao conectar a um ou mais bancos de dados. Verifique as URIs e configurações.");
    }
}

// --- Configuração do Gemini ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("Erro: Chave de API do Gemini não encontrada. Verifique seu arquivo .env e a variável GEMINI_API_KEY.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

const tools = [{
    functionDeclarations: [{
        name: "obter_clima_atual",
        description: "Obtém o clima atual para uma cidade específica. Use apenas se o usuário perguntar explicitamente sobre o clima.",
        parameters: {
            type: "OBJECT",
            properties: {
                cidade: {
                    type: "STRING",
                    description: "O nome da cidade para a qual obter o clima. Por exemplo: São Paulo, Londres, Tóquio."
                }
            },
            required: ["cidade"]
        }
    }]
}];

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    tools: tools,
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ],
});

// Middlewares do Express
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Função para lidar com a conversa e Function Calling ---
async function handleChatWithGemini(userMessage, chatHistory = []) {
    console.log(`[handleChatWithGemini] Iniciando chat. Histórico: ${chatHistory.length} turnos.`);
    const chat = model.startChat({
        history: chatHistory,
    });

    console.log(`[handleChatWithGemini] Enviando mensagem do usuário: "${userMessage}"`);
    let result = await chat.sendMessage(userMessage);

    while (true) {
        if (result.response.promptFeedback && result.response.promptFeedback.blockReason) {
            console.warn(`[handleChatWithGemini] Resposta bloqueada por segurança: ${result.response.promptFeedback.blockReason}`);
            return `Desculpe, não posso processar essa solicitação devido a políticas de segurança (${result.response.promptFeedback.blockReason}).`;
        }

        if (!result.response.candidates || result.response.candidates.length === 0 ||
            !result.response.candidates[0].content || !result.response.candidates[0].content.parts ||
            result.response.candidates[0].content.parts.length === 0) {
            console.error("[handleChatWithGemini] Resposta do Gemini não contém 'parts' válidas");
            return "Desculpe, recebi uma resposta inesperada do assistente.";
        }

        const responsePart = result.response.candidates[0].content.parts[0];

        if (responsePart.functionCall) {
            const fc = responsePart.functionCall;
            console.log(`[handleChatWithGemini] 🛠️ Gemini solicitou chamada de função: ${fc.name}`);

            let functionExecutionResult;

            if (fc.name === "obter_clima_atual") {
                try {
                    const cidadeParaClima = fc.args.cidade;
                    if (!cidadeParaClima) {
                        functionExecutionResult = { tool_output: { error: "Parâmetro 'cidade' não fornecido pela IA." }};
                    } else {
                        const weatherResult = await obterClima(cidadeParaClima);
                        console.log(`[handleChatWithGemini] Resultado de obterClima para "${cidadeParaClima}":`, weatherResult);

                        if (weatherResult.error) {
                            functionExecutionResult = { tool_output: { error: weatherResult.error }};
                        } else {
                            functionExecutionResult = { tool_output: weatherResult };
                        }
                    }
                } catch (error) {
                    console.error("[handleChatWithGemini] Exceção ao executar a função de clima:", error);
                    functionExecutionResult = { tool_output: { error: `Exceção ao buscar clima: ${error.message}` }};
                }
            } else {
                functionExecutionResult = { tool_output: { error: `Função ${fc.name} não implementada` }};
            }

            result = await chat.sendMessage([
                {
                    functionResponse: {
                        name: fc.name,
                        response: functionExecutionResult,
                    },
                },
            ]);
        } else if (responsePart.text) {
            const finalText = responsePart.text;
            console.log(`[handleChatWithGemini] 🤖 Gemini respondeu com texto: "${finalText}"`);
            return finalText;
        } else {
            console.error("[handleChatWithGemini] Resposta do Gemini sem functionCall ou text");
            return "Desculpe, tive um problema para processar a resposta do assistente.";
        }
    }
}

// --- Rotas ---
app.get('/', (req, res) => {
    res.send('Servidor do Chatbot (com Gemini e Function Calling) está no ar! Envie POST para /chat.');
});

app.post('/chat', async (req, res) => {
    const mensagemUsuario = req.body.mensagem;

    console.log('[API /chat] Mensagem recebida do frontend:', mensagemUsuario);

    if (!mensagemUsuario) {
        return res.status(400).json({ erro: 'Nenhuma mensagem fornecida no corpo da requisição (campo "mensagem").' });
    }

    try {
        const respostaBot = await handleChatWithGemini(mensagemUsuario);
        res.json({ resposta: respostaBot });
    } catch (e) {
        console.error("[API /chat] Erro inesperado na rota:", e);
        if (e.response && e.response.promptFeedback && e.response.promptFeedback.blockReason) {
            return res.status(400).json({ resposta: `Desculpe, sua solicitação foi bloqueada: ${e.response.promptFeedback.blockReason}`});
        }
        if (e.message && (e.message.includes('SAFETY') || e.message.includes('blocked'))) {
            return res.status(400).json({ resposta: "Desculpe, não posso responder a isso devido às políticas de segurança."});
        }
        res.status(500).json({ erro: "Ocorreu um erro interno no servidor ao processar sua mensagem."});
    }
});

app.post('/api/chat/salvar-historico', async (req, res) => {
    if (!dbHistoria) {
        return res.status(500).json({ error: "Servidor não conectado ao banco de dados de histórico." });
    }

    try {
        const { sessionId, userId, botId, startTime, endTime, messages } = req.body;

        if (!sessionId || !botId || !messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: "Dados incompletos para salvar histórico (sessionId, botId, messages são obrigatórios)." });
        }

        const novaSessao = {
            sessionId,
            userId: userId || 'anonimo',
            botId,
            startTime: startTime ? new Date(startTime) : new Date(),
            endTime: endTime ? new Date(endTime) : new Date(),
            messages,
            loggedAt: new Date()
        };

        const collection = dbHistoria.collection("sessoesChat");
        const result = await collection.insertOne(novaSessao);

        console.log('[Servidor] Histórico de sessão salvo:', result.insertedId);
        res.status(201).json({ message: "Histórico de chat salvo com sucesso!", sessionId: novaSessao.sessionId });

    } catch (error) {
        console.error("[Servidor] Erro em /api/chat/salvar-historico:", error.message);
        res.status(500).json({ error: "Erro interno ao salvar histórico de chat." });
    }
});

let dadosRankingVitrine = [];
app.post('/api/ranking/registrar-acesso-bot', (req, res) => {
    const { botId, nomeBot, timestampAcesso, usuarioId } = req.body;
    if (!botId || !nomeBot) {
        return res.status(400).json({ error: "ID e Nome do Bot são obrigatórios para o ranking." });
    }
    const acessoEm = timestampAcesso ? new Date(timestampAcesso) : new Date();
    const botExistente = dadosRankingVitrine.find(b => b.botId === botId);
    if (botExistente) {
        botExistente.contagem += 1;
        botExistente.ultimoAcesso = acessoEm;
    } else {
        dadosRankingVitrine.push({
            botId: botId,
            nomeBot: nomeBot,
            contagem: 1,
            ultimoAcesso: acessoEm,
            usuarioId: usuarioId || 'anonimo'
        });
    }
    console.log('[Ranking Simulado] Dados de ranking atualizados:', dadosRankingVitrine);
    res.status(201).json({ message: `Acesso ao bot ${nomeBot} registrado para ranking.` });
});

app.get('/api/ranking/visualizar', (req, res) => {
    const rankingOrdenado = [...dadosRankingVitrine].sort((a, b) => b.contagem - a.contagem);
    res.json(rankingOrdenado);
});

// Inicia o servidor
initializeDatabases().then(() => {
    app.listen(port, () => {
        console.log(`🤖 Servidor do Chatbot com Gemini rodando em http://localhost:${port}`);
    });
});
