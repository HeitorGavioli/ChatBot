const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
        if (await User.findOne({ username })) return res.status(400).json({ message: 'Usuário já existe.' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Tentativa de login para:', username); // ← Adicione este log
    
    try {
        const user = await User.findOne({ username });
        console.log('Usuário encontrado:', user ? 'Sim' : 'Não'); // ← Adicione este log
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            console.log('Credenciais inválidas'); // ← Adicione este log
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }
        
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        console.log('Login bem-sucedido, token gerado'); // ← Adicione este log
        res.json({ token, username: user.username });
    } catch (error) {
        console.error('Erro no login:', error); // ← Adicione este log
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});
module.exports = router;
