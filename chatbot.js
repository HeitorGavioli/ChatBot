// chatbot.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { obterClima } = require('./WeatherAPI');

const app = express();
const port = process.env.PORT || 3000;

async function obterHorarioAtual() {
    const agora = new Date();
    // Formata a data e hora. Exemplo: "quinta-feira, 14 de março de 2024, 15:30:52"
    // Você pode ajustar as opções de toLocaleString para o formato desejado.
    const dataHoraFormatada = agora.toLocaleString('pt-BR', {
        dateStyle: 'full', // e.g., "quinta-feira, 14 de março de 2024"
        timeStyle: 'long',  // e.g., "15:30:52 BRT" (ou o fuso do servidor)
        // timeZone: 'America/Sao_Paulo' // Opcional: para forçar um fuso horário específico
    });
    console.log(`[obterHorarioAtual] Horário atual gerado: ${dataHoraFormatada}`);
    // É crucial que a IA saiba qual chave esperar no objeto de retorno.
    // Se a descrição da ferramenta mencionar "data e hora", use chaves que reflitam isso.
    return {
        data_e_hora_atuais: dataHoraFormatada
        // Ou poderia ser mais granular, dependendo do que você quer que a IA use:
        // data: agora.toLocaleDateString('pt-BR', { dateStyle: 'full' }),
        // hora: agora.toLocaleTimeString('pt-BR', { timeStyle: 'long' })
    };
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
        description: "Obtém o clima/tempo atual para uma cidade específica. Use apenas se o usuário perguntar explicitamente sobre o clima ou tempo.",
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
    },
     {
            name: "obter_horario_atual", // VERIFIQUE SE ESTA FUNÇÃO ESTÁ DECLARADA GLOBALMENTE OU IMPORTADA
            description: "Obtém a data e hora atuais do servidor. Use apenas se o usuário perguntar explicitamente sobre a hora, data ou dia atual.",
            parameters: {
                type: "OBJECT",
                properties: {}
            }
        }
    ]
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
// -----------------------------

// --- Função para obter horário atual ---
// COLOQUE ESTA FUNÇÃO AQUI (ou importe se estiver em outro arquivo)



app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function handleChatWithGemini(userMessage, chatHistory = []) {
    console.log(`[handleChatWithGemini] Iniciando chat.`);
    if (chatHistory && chatHistory.length > 0) {
        console.log(`  Histórico recebido: ${chatHistory.length} turnos.`);
    } else {
        console.log("  Nenhum histórico recebido, começando uma nova conversa.");
    }

    const isValidHistory = Array.isArray(chatHistory) && chatHistory.every(
        turn => typeof turn === 'object' && turn !== null &&
                typeof turn.role === 'string' &&
                Array.isArray(turn.parts) &&
                turn.parts.every(part => typeof part === 'object' && part !== null && (part.text || part.functionCall || part.functionResponse))
    );

    if (chatHistory && chatHistory.length > 0 && !isValidHistory) {
        console.warn("[handleChatWithGemini] Histórico recebido parece ter um formato inválido. Usando histórico vazio.");
        chatHistory = [];
    }

    const chat = model.startChat({
        history: chatHistory,
    });

    console.log(`[handleChatWithGemini] Enviando mensagem do usuário: "${userMessage}"`);
    let result = await chat.sendMessage(userMessage);

    // INÍCIO DO LOOP CORRETO
    while (true) {
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

            let apiFunctionResult;

            if (fc.name === "obter_clima_atual") {
                try {
                    const cidadeParaClima = fc.args.cidade;
                    if (!cidadeParaClima) {
                        console.warn("[handleChatWithGemini] Parâmetro 'cidade' não fornecido pela IA para obter_clima_atual.");
                        apiFunctionResult = { erro: "Parâmetro 'cidade' não fornecido pela IA." };
                    } else {
                        apiFunctionResult = await obterClima(cidadeParaClima);
                        console.log(`[handleChatWithGemini] Resultado de obterClima para "${cidadeParaClima}":`, apiFunctionResult);
                    }
                } catch (error) {
                    console.error("[handleChatWithGemini] Exceção ao executar a função de clima:", error);
                    apiFunctionResult = { erro: `Exceção ao buscar clima: ${error.message}` };
                }
            } else if (fc.name === "obter_horario_atual") {
                try {
                    apiFunctionResult = await obterHorarioAtual(); // Chama a nova função
                    console.log(`[handleChatWithGemini] Resultado de obterHorarioAtual:`, apiFunctionResult);
                } catch (error) {
                    console.error("[handleChatWithGemini] Exceção ao executar a função de horário:", error);
                    apiFunctionResult = { erro: `Exceção ao buscar horário: ${error.message}` };
                }
            } else {
                console.warn(`[handleChatWithGemini] Tentativa de chamar função desconhecida: ${fc.name}`);
                apiFunctionResult = { erro: `Função ${fc.name} não implementada ou desconhecida.` };
            }

            // ESTA É A PARTE CORRETA PARA ENVIAR O RESULTADO DA FUNÇÃO DE VOLTA
            console.log("[handleChatWithGemini] 🔄 Enviando resultado da função para o Gemini...", JSON.stringify(apiFunctionResult, null, 2));
            try {
                result = await chat.sendMessage([
                    {
                        functionResponse: {
                            name: fc.name,
                            response: {
                                name: fc.name,
                                content: apiFunctionResult
                            }
                        },
                    },
                ]);
                // O loop 'while(true)' continuará a partir daqui para processar a nova 'result'
            } catch (e) {
                console.error("[handleChatWithGemini] Erro ao enviar functionResponse para o Gemini:", e);
                if (e.response && e.response.promptFeedback) {
                    console.error("Detalhes do bloqueio/erro do Gemini:", JSON.stringify(e.response.promptFeedback, null, 2));
                     return `Desculpe, houve um problema ao comunicar o resultado da função para o assistente (${e.response.promptFeedback.blockReason || 'erro desconhecido'}).`;
                }
                return "Desculpe, houve um erro interno ao processar o resultado da função.";
            }

        } else if (responsePart.text) {
            const finalText = responsePart.text;
            console.log(`[handleChatWithGemini] 🤖 Gemini respondeu com texto: "${finalText}"`);
            return finalText; // Sai do loop e retorna o texto final
        } else {
            console.error("[handleChatWithGemini] Resposta do Gemini sem functionCall ou text:", JSON.stringify(result.response, null, 2));
            return "Desculpe, tive um problema para processar a resposta do assistente."; // Sai do loop
        }
    } // FIM DO LOOP while(true) CORRETO
}
// ----------------------------------------

app.get('/', (req, res) => {
    res.send('Servidor do Chatbot (com Gemini e Function Calling) está no ar! Envie POST para /chat.');
});

app.post('/chat', async (req, res) => {
    const mensagemUsuario = req.body.mensagem;
    const historicoChatRecebido = req.body.historico || [];

    console.log('[API /chat] Mensagem recebida:', mensagemUsuario);
    if (historicoChatRecebido.length > 0) {
        console.log('[API /chat] Histórico recebido com', historicoChatRecebido.length, 'turnos.');
    }

    if (!mensagemUsuario) {
        return res.status(400).json({ erro: 'Nenhuma mensagem fornecida no corpo da requisição (campo "mensagem").' });
    }

    try {
        const respostaBot = await handleChatWithGemini(mensagemUsuario, historicoChatRecebido);
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

app.listen(port, () => {
    console.log(`🤖 Servidor do Chatbot com Gemini rodando em http://localhost:${port}`);
});