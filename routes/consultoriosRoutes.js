const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { 
    conectarWhatsappConsultorio, 
    statusWhatsappConsultorio, 
    sincronizarNuevoConsultorio 
} = require('../controllers/consultoriosController');

// 1. ✅ PRIMERO SE INICIALIZA EL ROUTER (Evita SyntaxError/TypeError de Express)
const router = Router();

// 2. Aplicamos el middleware de validación de Token JWT de forma segura
// router.use(validarJWT);

// =========================================================================
// 🌐 ENDPOINTS DE LA API (Prefijo base en index.js: /api/klyntic/consultorios)
// =========================================================================

// Mapeo: POST -> http://localhost:3000/api/klyntic/consultorios/sync
router.post('/sync', sincronizarNuevoConsultorio);

// Mapeo: POST -> http://localhost:3000/api/klyntic/consultorios/whatsapp/conectar/:id
// 🔥 NOTA: Angular debe disparar esta petición POST con el botón para prender Chromium
router.post('/whatsapp/conectar/:id', conectarWhatsappConsultorio);

// Mapeo: GET -> http://localhost:3000/api/klyntic/consultorios/whatsapp-status/:id
// ⏱️ NOTA: Esta es la URL que Angular debe consultar repetidamente en el Polling
router.get('/whatsapp-status/:id', statusWhatsappConsultorio);

module.exports = router;
