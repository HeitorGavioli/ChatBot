const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.get('/preferences', authMiddleware(), async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('customSystemInstruction');
        res.json({ instruction: user.customSystemInstruction || '' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar preferências.' });
    }
});

router.put('/preferences', authMiddleware(), async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { customSystemInstruction: req.body.instruction });
        res.json({ message: 'Personalidade salva com sucesso!' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao salvar personalidade.' });
    }
});

module.exports = router;
