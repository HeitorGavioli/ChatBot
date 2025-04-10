// 1. Carregar variáveis de ambiente ANTES de tudo
require('dotenv').config();

const express = require('express');
const cors = require('cors'); // Adicione esta linha
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const app = express();
const port = 3000;

// --- Configuração do Gemini ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("Erro: Chave de API do Gemini não encontrada. Verifique seu arquivo .env e a variável GEMINI_API_KEY.");
    process.exit(1); // Encerra se a chave não for encontrada
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest", // Ou outro modelo como "gemini-pro"
    // Opcional: Ajustes de segurança (veja a documentação do Google AI)
    // safetySettings: [
    //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    //   { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    // ],
});
// -----------------------------


// Middlewares do Express
app.use(cors()); // <<<<<< ADICIONE ESTA LINHA AQUI
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Função para obter resposta do Gemini ---
async function getGeminiResponse(userMessage) {
    try {
        // Define um prompt base para dar contexto ao Gemini (opcional, mas recomendado)
        const prompt = `Você é um assistente prestativo e amigável chamado ChatBot. Responda à seguinte mensagem do usuário de forma concisa e útil:\n\nUsuário: ${userMessage}\nAssistente:`;

        console.log("Enviando para Gemini:", prompt); // Log para depuração

        // const result = await model.generateContent(userMessage); // Forma mais simples
        const result = await model.generateContent(prompt); // Usando o prompt com contexto
        const response = await result.response;
        const text = response.text();

        console.log("Resposta do Gemini:", text); // Log para depuração
        return text;

    } catch (error) {
        console.error("Erro ao chamar a API do Gemini:", error);

        // Verifica se o erro é devido a bloqueio de segurança
        if (error.message.includes('SAFETY')) {
             return "Desculpe, não posso responder a isso devido às políticas de segurança.";
        }
        // Outros erros
        return "Desculpe, ocorreu um erro ao tentar processar sua mensagem. Tente novamente mais tarde.";
    }
}
// ----------------------------------------

// Rota principal (opcional)
app.get('/', (req, res) => {
    res.send('Servidor do Chatbot (com Gemini) está no ar! Envie POST para /chat.');
});

// Rota para receber mensagens do chatbot (via POST)
// Tornamos a função do handler async para poder usar await
app.post('/chat', async (req, res) => {
    const mensagemUsuario = req.body.mensagem;

    console.log('Mensagem recebida do frontend:', mensagemUsuario);

    if (!mensagemUsuario) {
        return res.status(400).json({ erro: 'Nenhuma mensagem fornecida no corpo da requisição (campo "mensagem").' });
    }

    // Chama a função que usa o Gemini
    const respostaBot = await getGeminiResponse(mensagemUsuario);

    // Envia a resposta de volta como JSON
    res.json({ resposta: respostaBot });
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`🤖 Servidor do Chatbot com Gemini rodando em http://localhost:${port}`);
    if (!apiKey) {
        console.warn("AVISO: Chave de API do Gemini não configurada. O bot não funcionará corretamente.");
    }
});