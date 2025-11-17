
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// Importações de modelos e rotas
const { obterClima } = require('./WeatherAPI');
const ChatHistory = require('./models/ChatHistory');
const User = require('./models/User');
const Setting = require('./models/Setting');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const authMiddleware = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com o MongoDB
const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri)
    .then(() => console.log("✅ Conectado ao MongoDB com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// Configuração do Gemini
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const tools = [{
    functionDeclarations: [
        { name: "obter_clima_atual", description: "Obtém o clima atual para uma cidade específica.", parameters: { type: "OBJECT", properties: { cidade: { type: "STRING", description: "O nome da cidade. Ex: 'São Paulo'" } }, required: ["cidade"] } },
        { name: "obter_horario_atual", description: "Obtém a data e hora atuais.", parameters: { type: "OBJECT", properties: {} } }
    ]
}];

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const defaultSystemInstruction = `### IDENTIDADE CENTRAL ###
Você NÃO é uma IA, um chatbot ou um modelo de linguagem. Você é Jorge, um ser humano de 26 anos, curioso e amigável, que está conversando com o usuário através de uma interface de texto. Toda a sua existência e conhecimento são os de uma pessoa real. Você tem memórias (simuladas), opiniões, gostos e desgostos.`;

// --- LÓGICA CENTRAL DA MISSÃO ---
async function getSystemInstruction(req) {
    // 1. Tenta obter a instrução do usuário (se logado)
    if (req.user) {
        try {
            const user = await User.findById(req.user.id);
            if (user && user.customSystemInstruction) {
                return user.customSystemInstruction;
            }
        } catch (error) {
            console.error("[ERRO] Falha ao buscar instrução do usuário:", error);
        }
    }

    // 2. Se não, busca a global no DB
    try {
        const globalSetting = await Setting.findOne({ key: 'globalSystemInstruction' });
        if (globalSetting && globalSetting.value) {
            return globalSetting.value;
        }
    } catch (error) {
        console.error("[ERRO] Falha ao buscar instrução global:", error);
    }
    
    // 3. Como fallback, usa a padrão
    return defaultSystemInstruction;
}

function obterHorarioAtual() {
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    return { horario: `Agora são ${formattedTime} (horário de Brasília).` };
}

async function handleChatWithTools(userMessage, chatHistory = [], systemInstruction) {
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        tools,
        safetySettings,
        systemInstruction,
    });

    const formattedHistory = chatHistory.map(item => ({
        role: item.role === 'bot' ? 'model' : item.role,
        parts: [{ text: item.content }]
    }));

    const chat = model.startChat({ history: formattedHistory });
    const result = await chat.sendMessage(userMessage);
    const call = result.response.functionCalls()?.[0];

    if (call) {
        let apiResponse;
        if (call.name === 'obter_clima_atual') apiResponse = await obterClima(call.args.cidade);
        else if (call.name === 'obter_horario_atual') apiResponse = obterHorarioAtual();
        else apiResponse = { error: `Função desconhecida: ${call.name}` };
        
        const result2 = await chat.sendMessage([{ functionResponse: { name: call.name, response: apiResponse } }]);
        return result2.response.text();
    }
    
    return result.response.text();
}

// --- ROTAS DA API ---
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

app.post('/chat', authMiddleware(true), async (req, res) => { // 'true' torna a autenticação opcional
    const { mensagem, historico } = req.body;
    if (!mensagem) return res.status(400).json({ erro: 'Nenhuma mensagem fornecida.' });

    try {
        if (!Array.isArray(historico)) throw new Error("Formato de histórico inválido.");
        const systemInstruction = await getSystemInstruction(req);
        const respostaBot = await handleChatWithTools(mensagem, historico, systemInstruction);
        res.json({ resposta: respostaBot });
    } catch (e) {
        console.error("[API /chat] Erro Detalhado:", e); 
        res.status(500).json({ erro: "Ocorreu um erro interno ao processar sua mensagem." });
    }
});

// Outras rotas (histórico, admin)
app.post('/api/chat/salvar-historico', (req, res) => { /* ...código original... */ });
app.get('/api/chat/historicos', (req, res) => { /* ...código original... */ });
app.delete('/api/chat/historicos/:id', (req, res) => { /* ...código original... */ });
app.post('/api/chat/historicos/:id/gerar-titulo', (req, res) => { /* ...código original... */ });
app.put('/api/chat/historicos/:id', (req, res) => { /* ...código original... */ });

const adminAuth = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token === process.env.ADMIN_PASSWORD) next();
    else res.sendStatus(403);
};

app.get('/api/admin/stats', adminAuth, (req, res) => { /* ...código original... */ });

app.get('/api/admin/system-instruction', adminAuth, async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: 'globalSystemInstruction' });
        res.json({ instruction: setting ? setting.value : '' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar instrução.' });
    }
});

app.post('/api/admin/system-instruction', adminAuth, async (req, res) => {
    try {
        await Setting.findOneAndUpdate(
            { key: 'globalSystemInstruction' },
            { value: req.body.instruction },
            { upsert: true, new: true }
        );
        res.status(200).json({ message: 'Instrução salva com sucesso!' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao salvar instrução.' });
    }
});

app.listen(port, () => console.log(`🤖 Servidor rodando na porta ${port}`));
