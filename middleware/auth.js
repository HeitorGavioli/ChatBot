const jwt = require('jsonwebtoken');

module.exports = function(optional = false) {
    return (req, res, next) => {
        const token = req.headers['authorization']?.split(' ')[1];

        if (!token) {
            if (optional) return next();
            return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
        }

        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET);
            next();
        } catch (ex) {
            if (optional) return next();
            res.status(400).json({ message: 'Token inválido.' });
        }
    };
};
