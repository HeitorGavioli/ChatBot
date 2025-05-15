// chatbot.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { obterClima } = require('./WeatherAPI'); // Certifique-se que este arquivo existe e funciona

const app = express();
const port = process.env.PORT || 3000; // Use a porta do ambiente ou 3000

// --- Configuração do Gemini ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("Erro: Chave de API do Gemini não encontrada. Verifique seu arquivo .env e a variável GEMINI_API_KEY.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Definição da Ferramenta (Tool)
const tools = [{
    functionDeclarations: [{
        name: "obter_clima_atual", // Nome da função como o Gemini a chamará
        description: "Obtém o clima atual para uma cidade específica. Use apenas se o usuário perguntar explicitamente sobre o clima.",
        parameters: {
            type: "OBJECT",
            properties: {
                cidade: { // Parâmetro esperado pela função
                    type: "STRING",
                    description: "O nome da cidade para a qual obter o clima. Por exemplo: São Paulo, Londres, Tóquio."
                }
            },
            required: ["cidade"] // Parâmetro obrigatório
        }
    }]
}];

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest", // Ou "gemini-pro" se preferir
    tools: tools,
    // Opcional: Ajustes de segurança (veja a documentação do Google AI)
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ],
    // Opcional: Configurações de geração
    // generationConfig: {
    //   temperature: 0.7,
    //   topP: 0.95,
    //   topK: 40
    // }
});
// -----------------------------

// Middlewares do Express
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Função para lidar com a conversa e Function Calling ---
async function handleChatWithGemini(userMessage, chatHistory = []) {
    console.log(`[handleChatWithGemini] Iniciando chat. Histórico: ${chatHistory.length} turnos.`);
    const chat = model.startChat({
        history: chatHistory,
        // tools já estão no 'model'
    });

    console.log(`[handleChatWithGemini] Enviando mensagem do usuário: "${userMessage}"`);
    let result = await chat.sendMessage(userMessage);

    while (true) {
        // Verifica se a resposta está bloqueada por segurança ANTES de tentar acessar parts
        if (result.response.promptFeedback && result.response.promptFeedback.blockReason) {
            console.warn(`[handleChatWithGemini] Resposta bloqueada por segurança: ${result.response.promptFeedback.blockReason}`, result.response.promptFeedback);
            return `Desculpe, não posso processar essa solicitação devido a políticas de segurança (${result.response.promptFeedback.blockReason}).`;
        }

        if (!result.response.candidates || result.response.candidates.length === 0 ||
            !result.response.candidates[0].content || !result.response.candidates[0].content.parts ||
            result.response.candidates[0].content.parts.length === 0) {
            console.error("[handleChatWithGemini] Resposta do Gemini não contém 'parts' válidas:", JSON.stringify(result.response, null, 2));
            return "Desculpe, recebi uma resposta inesperada do assistente.";
        }

        const responsePart = result.response.candidates[0].content.parts[0];

        if (responsePart.functionCall) {
            const fc = responsePart.functionCall;
            console.log(`[handleChatWithGemini] 🛠️ Gemini solicitou chamada de função: ${fc.name}`);
            console.log(`  Argumentos: ${JSON.stringify(fc.args)}`);

            let functionExecutionResult;

           if (fc.name === "obter_clima_atual") {
                try {
                    const cidadeParaClima = fc.args.cidade;
                    if (!cidadeParaClima) {
                        // ...
                        functionExecutionResult = { tool_output: { error: "Parâmetro 'cidade' não fornecido pela IA." }}; // Envolver em tool_output
                    } else {
                        const weatherResult = await obterClima(cidadeParaClima); // Sua função de WeatherAPI.js
                        console.log(`[handleChatWithGemini] Resultado de obterClima para "${cidadeParaClima}":`, weatherResult);

                        if (weatherResult.error) { // <<<< VERIFICA SE HOUVE ERRO
                            functionExecutionResult = { tool_output: { error: weatherResult.error }};
                        } else {
                            // Se não houve erro, weatherResult contém os dados do clima
                            // O Gemini espera que o 'response' da função seja um objeto JSON
                            // Os dados já estão bem estruturados
                            functionExecutionResult = { tool_output: weatherResult };
                        }
                    }
                } catch (error) { // Captura exceções inesperadas de obterClima
                    console.error("[handleChatWithGemini] Exceção ao executar a função de clima:", error);
                    functionExecutionResult = { tool_output: { error: `Exceção ao buscar clima: ${error.message}` }};
                }
            } else {
                // ...
            }

            console.log("[handleChatWithGemini] 🔄 Enviando resultado da função para o Gemini...", JSON.stringify(functionExecutionResult, null, 2));
            result = await chat.sendMessage([
                {
                    functionResponse: {
                        name: fc.name,
                        // O SDK espera um objeto para 'response'.
                        // E o conteúdo desse objeto (o resultado da sua ferramenta) também deve ser um objeto.
                        response: functionExecutionResult, // functionExecutionResult já é { tool_output: ... }
                    },
                },
            ]);
            // Continue o loop para ver se o Gemini responde com texto ou outra chamada de função

        } else if (responsePart.text) {
            const finalText = responsePart.text;
            console.log(`[handleChatWithGemini] 🤖 Gemini respondeu com texto: "${finalText}"`);
            // Atualiza o histórico para a próxima interação (opcional, mas bom para contexto)
            // chatHistory.push({ role: "user", parts: [{ text: userMessage }] });
            // chatHistory.push({ role: "model", parts: [{ text: finalText }] });
            return finalText; // Resposta final
        } else {
            // Caso inesperado ou se a resposta não tiver nem functionCall nem text
            console.error("[handleChatWithGemini] Resposta do Gemini sem functionCall ou text:", JSON.stringify(result.response, null, 2));
            return "Desculpe, tive um problema para processar a resposta do assistente.";
        }
    }
}
// ----------------------------------------

// Rota principal (opcional)
app.get('/', (req, res) => {
    res.send('Servidor do Chatbot (com Gemini e Function Calling) está no ar! Envie POST para /chat.');
});

// Rota para receber mensagens do chatbot (via POST)
app.post('/chat', async (req, res) => {
    const mensagemUsuario = req.body.mensagem;

    console.log('[API /chat] Mensagem recebida do frontend:', mensagemUsuario);

    if (!mensagemUsuario) {
        return res.status(400).json({ erro: 'Nenhuma mensagem fornecida no corpo da requisição (campo "mensagem").' });
    }

    try {
        // Para um chatbot real com estado, você gerenciaria o histórico de chat por sessão/usuário
        // Por simplicidade, este exemplo não mantém histórico entre chamadas à API /chat
        const respostaBot = await handleChatWithGemini(mensagemUsuario /*, históricoSeTiver */);
        res.json({ resposta: respostaBot });
    } catch (e) {
        console.error("[API /chat] Erro inesperado na rota:", e);
        // Verifique se o erro é um objeto de erro da API Gemini
        if (e.response && e.response.promptFeedback && e.response.promptFeedback.blockReason) {
            return res.status(400).json({ resposta: `Desculpe, sua solicitação foi bloqueada: ${e.response.promptFeedback.blockReason}`});
        }
        if (e.message && (e.message.includes('SAFETY') || e.message.includes('blocked'))) {
             return res.status(400).json({ resposta: "Desculpe, não posso responder a isso devido às políticas de segurança."});
        }
        res.status(500).json({ erro: "Ocorreu um erro interno no servidor ao processar sua mensagem."});
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`🤖 Servidor do Chatbot com Gemini rodando em http://localhost:${port}`);
});