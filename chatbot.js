require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Importa o CORS
const mongoose = require('mongoose');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// --- PASSO 1: INICIALIZAR O APP EXPRESS PRIMEIRO ---
const app = express();

// --- PASSO 2: CONFIGURAR O CORS IMEDIATAMENTE APÓS A INICIALIZAÇÃO ---
const allowedOrigins = [
  'https://chat-bot-eight-opal.vercel.app', // Seu frontend no Vercel
  'http://localhost:3000',                  // Para testes locais
  'http://127.0.0.1:5500'                   // Para testes locais com Live Server
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Acesso não permitido pela política de CORS'));
    }
  }
};

app.use(cors(corsOptions)); // Usa as opções de CORS configuradas

// Importações dos modelos e rotas
const { obterClima } = require('./WeatherAPI');
const ChatHistory = require('./models/ChatHistory');
const User = require('./models/User');
const Setting = require('./models/Setting');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const authMiddleware = require('./middleware/auth');

const port = process.env.PORT || 3000;

// Middlewares essenciais (note que o cors já foi configurado acima)
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
    try {
        const globalSetting = await Setting.findOne({ key: 'globalSystemInstruction' });
        if (globalSetting && globalSetting.value) {
            return globalSetting.value;
        }
    } catch (error) {
        console.error("[ERRO] Falha ao buscar instrução global:", error);
    }
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

app.post('/chat', authMiddleware(true), async (req, res) => {
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
// ... (O resto das suas rotas de histórico e admin que já funcionavam)
const adminAuth = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token === process.env.ADMIN_PASSWORD) next();
    else res.sendStatus(403);
};
app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        const stats = await ChatHistory.aggregate([
            {
                $group: {
                    _id: null,
                    totalConversations: { $sum: 1 },
                    totalMessages: { $sum: { $size: "$messages" } },
                    totalErrors: { 
                        $sum: { 
                            $size: { 
                                $filter: { 
                                    input: "$messages", 
                                    as: "msg", 
                                    cond: { $eq: ["$$msg.role", "error"] } 
                                } 
                            } 
                        } 
                    },
                    averageDuration: { 
                        $avg: { 
                            $cond: [
                                { $ne: ["$endTime", null] },
                                { $subtract: ["$endTime", "$startTime"] },
                                null
                            ]
                        } 
                    }
                }
            }
        ]);

        const conversations = await ChatHistory.find()
            .sort({ startTime: -1 })
            .limit(5)
            .select('title startTime messages');

        res.json({
            totalConversations: stats[0]?.totalConversations || 0,
            totalMessages: stats[0]?.totalMessages || 0,
            totalErrors: stats[0]?.totalErrors || 0,
            averageConversationDuration: stats[0]?.averageDuration ? Math.round(stats[0].averageDuration / 1000) : 0,
            recentConversations: conversations
        });
    } catch (error) {
        console.error("Erro ao calcular estatísticas:", error);
        res.status(500).json({ error: "Erro interno ao calcular estatísticas" });
    }
});

app.get('/api/admin/system-instruction', adminAuth, async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: 'globalSystemInstruction' });
        res.json({ instruction: setting?.value || '' });
    } catch (error) {
        console.error("Erro ao buscar instrução:", error);
        res.status(500).json({ error: "Erro interno" });
    }
});

app.post('/api/admin/system-instruction', adminAuth, async (req, res) => {
    try {
        await Setting.findOneAndUpdate(
            { key: 'globalSystemInstruction' },
            { value: req.body.instruction },
            { upsert: true, new: true }
        );
        res.json({ message: "Instrução atualizada com sucesso!" });
    } catch (error) {
        console.error("Erro ao salvar instrução:", error);
        res.status(500).json({ error: "Erro interno ao salvar instrução" });
    }
});

// ... Rotas de admin ...

app.listen(port, () => console.log(`🤖 Servidor rodando na porta ${port}`));


