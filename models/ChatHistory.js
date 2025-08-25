// models/ChatHistory.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
        enum: ['user', 'bot', 'error'] // Define os papéis possíveis
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        required: true
    }
});

const chatHistorySchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true, // Garante que cada sessão seja única
        index: true
    },
    botId: {
        type: String,
        required: true
    },
      title: {
        type: String,
        default: 'Nova Conversa', // Um padrão mais amigável
        trim: true
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date
    },
    messages: [messageSchema] // Array de mensagens usando o schema definido acima
}, { timestamps: true }); // Adiciona createdAt e updatedAt automaticamente

module.exports = mongoose.model('ChatHistory', chatHistorySchema);