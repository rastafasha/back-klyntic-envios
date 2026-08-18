const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { 
    conectarWhatsappConsultorio, 
    statusWhatsappConsultorio, 
    sincronizarNuevoConsultorio 
} = require('../controllers/consultoriosController');

// 🚀 IMPORTAMOS TU SCRIPT DE RECORDATORIOS
const { ejecutarRecordatorios } = require('../config/recordatorios-cron'); 

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

// Mapeo: GET -> http://localhost:3000/api/klyntic/consultorios/tasks/recordatorios
// 🔒 Disparador externo gratuito (Cron-Job.org)
router.get('/tasks/recordatorios', async (req, res) => {
    try {
        console.log('📡 [HTTP Trigger] Petición externa recibida de Cron-Job.org. Iniciando barrido médico...');
        
        // 🚀 Ejecutamos los recordatorios aprovechando este mismo servidor encendido
        ejecutarRecordatorios(); 
        
        // Respondemos de inmediato un 200 OK para liberar la conexión en milisegundos
        return res.status(200).json({ 
            success: true, 
            msg: 'Proceso de recordatorios iniciado en segundo plano exitosamente.' 
        });
    } catch (error) {
        console.error('❌ Error lanzando recordatorios por HTTP:', error.message);
        return res.status(500).json({ error: error.message });
    }
});


module.exports = router;
