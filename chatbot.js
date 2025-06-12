// chatbot.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { MongoClient, ServerApiVersion } = require('mongodb'); 
const { obterClima } = require('./WeatherAPI');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuração da Conexão com MongoDB Atlas ---
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error("❌ ERRO: A variável MONGO_URI não foi encontrada no arquivo .env!");
    process.exit(1);
}
const clientOptions = {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
};
const client = new MongoClient(mongoUri, clientOptions);
let db;

async function connectDB() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        db = client.db("IIW2023A_Logs"); 
        console.log("✅ Conectado com sucesso ao MongoDB Atlas!");
    } catch (e) {
        console.error("❌ Não foi possível conectar ao MongoDB Atlas", e);
        await client.close();
        process.exit(1);
    }
}

// ... (o resto do código do Gemini, etc., permanece o mesmo) ...

// --- ENDPOINTS DE LOG E RANKING ---

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

// Endpoint para o frontend obter o IP do cliente
app.get('/api/user-info', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    res.json({ ip });
});

// Endpoint para registrar o log de acesso no MongoDB (ATUALIZADO)
app.post('/api/log-connection', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: "Serviço de banco de dados indisponível." });
    }

    // ATUALIZAÇÃO: Esperar 'nomeBot' do corpo da requisição
    const { ip, acao, nomeBot } = req.body;
    
    // ATUALIZAÇÃO: Validar o novo campo
    if (!ip || !acao || !nomeBot) {
        return res.status(400).json({ error: "Dados de log incompletos (IP, ação e nome do bot são obrigatórios)." });
    }

    const agora = new Date();
    const dataFormatada = agora.toISOString().split('T')[0];
    const horaFormatada = agora.toTimeString().split(' ')[0];

    // ATUALIZAÇÃO: Adicionar o novo campo ao objeto a ser salvo
    const logEntry = {
        col_data: dataFormatada,
        col_hora: horaFormatada,
        col_nome_bot:BotHeitor,
        col_IP: ip,
        col_acao: acao
    };

    try {
        const collection = db.collection("tb_cl_user_log_acess");
        const result = await collection.insertOne(logEntry);
        console.log(`[MongoDB] Log de acesso inserido com ID: ${result.insertedId}`);
        res.status(201).json({ message: "Log registrado com sucesso.", id: result.insertedId });
    } catch (e) {
        console.error("[MongoDB] Falha ao inserir log de acesso:", e);
        res.status(500).json({ error: "Erro ao registrar o log no banco de dados." });
    }
});


// O resto do chatbot.js (endpoints de ranking e chat) não precisa de alteração
// ... (código dos endpoints de ranking e chat aqui) ...
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
            nomeBot: BotHeitor,
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

// ... (código da função handleChatWithGemini e da rota /chat) ...

// Inicia o servidor
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`🤖 Servidor do Chatbot com Gemini rodando em http://localhost:${port}`);
    });
});
