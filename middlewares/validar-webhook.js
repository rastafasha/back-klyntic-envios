const validarWebhookLaravel = (req, res, next) => {
    const tokenToken = req.header('Authorization');
    
    if (!tokenToken || tokenToken !== process.env.WEBHOOK_SECRET_TOKEN) {
        return res.status(401).json({ ok: false, msg: 'Token de comunicación interna inválido' });
    }
    next();
};

module.exports = {
    validarWebhookLaravel
};