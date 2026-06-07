const jwt = require('jsonwebtoken');

/**
 * 1. Valida el token básico que viene de Angular
 */
const validarJWT = (req, res, next) => {
    const token = req.header('x-token');

    if (!token) {
        return res.status(401).json({
            ok: false,
            msg: 'No hay token en la petición'
        });
    }

    try {
        // Desencriptamos el token. Laravel debió meter el 'uid' y el 'role' dentro del payload del JWT
        const { uid, role } = jwt.verify(token, process.env.JWT_SECRET);

        req.uid = uid;   // ID numérico o UUID de MySQL
        req.role = role; // Rol del usuario (ej: 'ADMIN', 'DOCTOR', 'GUEST')
        next();

    } catch (error) {
        return res.status(401).json({
            ok: false,
            msg: 'Token no válido'
        });
    }
};



module.exports = {
    validarJWT,
};
