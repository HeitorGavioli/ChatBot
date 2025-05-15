// WeatherAPI.js
require('dotenv').config();
const axios = require('axios');

const OPENWEATHERMAP_API_KEY = process.env.OPEN_WEATHER_MAP;

async function obterClima(cidade) {
    if (!OPENWEATHERMAP_API_KEY) {
        console.error("[WeatherAPI] Chave da API OpenWeatherMap não definida!");
        // É melhor retornar um objeto de erro aqui também, para consistência
        return { error: "Configuração do servidor de clima incompleta." };
    }
    if (!cidade || typeof cidade !== 'string' || cidade.trim() === "") {
        console.warn("[WeatherAPI] Tentativa de obter clima para cidade inválida ou vazia.");
        return { error: "Por favor, especifique uma cidade válida para verificar o clima." };
    }

    console.log(`[WeatherAPI] Buscando clima para: "${cidade}"`);
    const lang = 'pt_br';
    const units = 'metric';
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cidade)}&appid=${OPENWEATHERMAP_API_KEY}&units=${units}&lang=${lang}`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        // Log da resposta completa da API para depuração
        console.log(`[WeatherAPI] Resposta da OpenWeatherMap para "${cidade}":`, JSON.stringify(data, null, 2));

        // Verificação MAIS ROBUSTA da resposta da API
        // A OpenWeatherMap retorna um 'cod' 200 (number) em caso de sucesso.
        // Erros como cidade não encontrada podem retornar 'cod' como string "404".
        if (!data || data.cod === undefined || data.cod.toString() !== "200") {
            let errorMessage = `Não foi possível obter o clima para ${cidade}.`;
            if (data && data.message) {
                errorMessage += ` (API diz: ${data.message})`;
            } else if (data && data.cod) {
                errorMessage += ` (Código de erro da API: ${data.cod})`;
            } else {
                errorMessage += ` (Resposta inesperada da API de clima.)`;
            }
            console.warn(`[WeatherAPI] Problema com a resposta da API para "${cidade}": ${errorMessage}`);
            return { error: errorMessage }; // Retorna um objeto de erro
        }

        // Se chegou aqui, data.cod é 200 e esperamos que data.main exista.
        // Adicionar uma verificação extra para data.main por segurança:
        if (!data.main || !data.weather || !data.weather[0]) {
            console.error(`[WeatherAPI] Resposta da API para "${cidade}" tem cod 200, mas está faltando 'main' ou 'weather'. Data:`, JSON.stringify(data, null, 2));
            return { error: `Dados de clima incompletos recebidos para ${cidade}.` };
        }

        // AGORA é mais seguro acessar as propriedades
        const temperatura = data.main.temp;       // Linha 28 (ou próxima a ela)
        const descricao = data.weather[0].description;
        const nomeCidadeRetornado = data.name;
        const sensacao = data.main.feels_like;
        const umidade = data.main.humidity;

        return {
            local: nomeCidadeRetornado,
            descricao: descricao,
            temperaturaCelsius: temperatura.toFixed(1),
            sensacaoTermicaCelsius: sensacao.toFixed(1),
            umidadePercentual: umidade,
            success: true // Adiciona um indicador de sucesso
        };

    } catch (error) {
        console.error(`[WeatherAPI] Exceção ao buscar clima para "${cidade}":`, error.isAxiosError ? (error.response ? JSON.stringify(error.response.data, null, 2) : error.message) : error.message);
        let detailedErrorMessage = `Ocorreu um erro ao tentar buscar o clima para ${cidade}.`;
        if (error.response) { // Erro da requisição HTTP (ex: 401, 404, 500 da API de clima)
            if (error.response.status === 401) {
                detailedErrorMessage = "Não foi possível conectar ao serviço de clima (chave inválida ou problema de autenticação).";
            } else if (error.response.status === 404) {
                detailedErrorMessage = `Não consegui encontrar informações do clima para a cidade "${cidade}". Verifique o nome e tente novamente. (API status 404)`;
            } else if (error.response.data && error.response.data.message) {
                detailedErrorMessage += ` (API diz: ${error.response.data.message})`;
            }
        }
        return { error: detailedErrorMessage }; // Retorna um objeto de erro
    }
}

module.exports = { obterClima };