require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { obterClima } = require('./WeatherAPI');
const ChatHistory = require('./models/ChatHistory');

const app = express();
const port = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Servir Arquivos Estáticos (HTML, CSS, JS do Frontend) ---
// O Express vai servir os arquivos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- Conexão com o MongoDB ---
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("Erro: String de conexão do MongoDB não encontrada. Verifique seu arquivo .env.");
    process.exit(1);
}
mongoose.connect(mongoUri)
    .then(() => console.log("✅ Conectado ao MongoDB com sucesso!"))
    .catch(err => {
        console.error("❌ Erro ao conectar ao MongoDB:", err);
        process.exit(1);
    });

// --- Configuração do Gemini ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("Erro: Chave de API do Gemini não encontrada.");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const tools = [{
    functionDeclarations: [{
        name: "obter_clima_atual",
        description: "Obtém o clima atual para uma cidade específica.",
        parameters: {
            type: "OBJECT",
            properties: { cidade: { type: "STRING", description: "O nome da cidade." } },
            required: ["cidade"]
        }
    }]
}];
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    tools: tools,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ],
});

// --- Função de Chat com Gemini ---
async function handleChatWithGemini(userMessage, chatHistory = []) {
    const chat = model.startChat({ history: chatHistory });
    let result = await chat.sendMessage(userMessage);
    while (true) {
        if (result.response.promptFeedback?.blockReason) {
            return `Desculpe, não posso processar essa solicitação (${result.response.promptFeedback.blockReason}).`;
        }
        const responsePart = result.response.candidates?.[0]?.content?.parts?.[0];
        if (!responsePart) return "Desculpe, recebi uma resposta inesperada do assistente.";

        if (responsePart.functionCall) {
            const fc = responsePart.functionCall;
            const weatherResult = await obterClima(fc.args.cidade);
            result = await chat.sendMessage([{ functionResponse: { name: fc.name, response: { tool_output: weatherResult } } }]);
        } else if (responsePart.text) {
            return responsePart.text;
        } else {
            return "Desculpe, tive um problema para processar a resposta.";
        }
    }
}

// --- ROTAS DA API ---

// Rota para o chat
app.post('/chat', async (req, res) => {
    const { mensagem } = req.body;
    if (!mensagem) return res.status(400).json({ erro: 'Nenhuma mensagem fornecida.' });
    try {
        const respostaBot = await handleChatWithGemini(mensagem);
        res.json({ resposta: respostaBot });
    } catch (e) {
        console.error("[API /chat] Erro:", e);
        res.status(500).json({ erro: "Ocorreu um erro interno." });
    }
});

// Rota para salvar o histórico
app.post('/api/chat/salvar-historico', async (req, res) => {
    const { sessionId, botId, startTime, endTime, messages } = req.body;
    if (!sessionId || !messages) return res.status(400).json({ message: "sessionId e messages são obrigatórios." });
    try {
        const updatedHistory = await ChatHistory.findOneAndUpdate(
            { sessionId },
            { $set: { botId, startTime, endTime, messages } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.status(200).json({ message: "Histórico salvo com sucesso!", data: updatedHistory });
    } catch (error) {
        console.error("[API /salvar-historico] Erro:", error);
        res.status(500).json({ message: "Erro ao salvar o histórico." });
    }
});

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

// --- Inicia o servidor ---
app.listen(port, () => {
    console.log(`🤖 Servidor rodando em http://localhost:${port}`);
});