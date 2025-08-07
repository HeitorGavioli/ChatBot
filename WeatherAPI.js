require('dotenv').config();
const axios = require('axios');

const OPENWEATHERMAP_API_KEY = process.env.OPEN_WEATHER_MAP;

async function obterClima(cidade) {
    if (!OPENWEATHERMAP_API_KEY) {
        return { error: "Configuração do servidor de clima incompleta." };
    }
    if (!cidade) {
        return { error: "Por favor, especifique uma cidade." };
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cidade)}&appid=${OPENWEATHERMAP_API_KEY}&units=metric&lang=pt_br`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        if (data.cod?.toString() !== "200") {
            return { error: `Não foi possível obter o clima para ${cidade}.` };
        }

        return {
            local: data.name,
            descricao: data.weather[0].description,
            temperaturaCelsius: data.main.temp.toFixed(1),
            sensacaoTermicaCelsius: data.main.feels_like.toFixed(1),
            umidadePercentual: data.main.humidity,
            success: true
        };

    } catch (error) {
        let detailedErrorMessage = `Ocorreu um erro ao buscar o clima para ${cidade}.`;
        if (error.response?.status === 404) {
            detailedErrorMessage = `Não encontrei a cidade "${cidade}".`;
        }
        return { error: detailedErrorMessage };
    }
}

module.exports = { obterClima };