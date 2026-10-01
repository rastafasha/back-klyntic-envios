const jwt = require('jsonwebtoken');


/**
 * 🛰️ MITIGACIÓN MAESTRA: Validador de Tokens Cruzados (Laravel -> Node.js)
 * Lee la firma secreta compartida y mapea el 'sub' de MySQL al 'uid' de Mongo.
 */
const validarJWT = (req, res, next) => {
    const token = req.header('x-token');

    // 1. Si no hay cabecera, rebote inmediato
    if (!token) {
        return res.status(401).json({
            ok: false,
            msg: 'No hay token en la petición'
        });
    }

    try {
        // 2. Verificación nativa con la clave compartida
        // Forzamos el algoritmo HS256 que es el que usa Laravel por defecto
        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        // 3. EL MAPEO CRUCIAL:
        // Laravel guarda el ID del usuario en 'sub'. Si no viene, buscamos un fallback en 'uid'.
        const userId = payload.sub || payload.uid;
        
        // Extraemos el rol. Laravel lo mete en 'role', si viene en null asumimos 'DOCTOR' por seguridad de flujo
        const userRole = payload.role || 'DOCTOR';

        if (!userId) {
            return res.status(401).json({
                ok: false,
                msg: 'Token inválido: Identificador de usuario ausente en el payload'
            });
        }

        // 4. Inyectamos los datos saneados en la petición para los controladores de notificaciones
        req.uid = String(userId).trim(); 
        req.role = String(userRole).toUpperCase().trim();

        console.log(`🔑 [NODE AUTH] Token de Laravel validado. Usuario: ${req.uid} | Rol: ${req.role}`);
        next();

    } catch (error) {
        console.error('🚨 [NODE AUTH ERROR] Falló la desencriptación del token:', error.message);
        return res.status(401).json({
            ok: false,
            msg: 'Token no válido o expirado'
        });
    }
};

// const validarJWT = (req, res, next) => {
//     // 🚀 BYPASS ATÓMICO KLYNTIC ENTERPRISE (Para internet lento / Pruebas locales)
//     console.log('🛡️ [BYPASS NODE] Saltando validación de firmas de Laravel.');
    
//     req.uid = 3;       // Le clavamos el ID del Doctor Joaquín en caliente
//     req.role = 'DOCTOR'; // Forzamos el rol médico
    
//     return next(); // ¡Pasas directo sin que nadie te rebote!
// };



module.exports = {
    validarJWT,
};
