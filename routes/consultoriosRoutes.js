const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { 
    conectarWhatsappConsultorio,
    statusWhatsappConsultorio
} = require('../controllers/consultoriosController'); // Tu controlador de consultorios

const router = Router();

router.use(validarJWT);

// Rutas idénticas en comportamiento a las de restaurantes pero para el contexto médico
router.post('/whatsapp/conectar/:id', conectarWhatsappConsultorio);
router.get('/whatsapp-status/:id', statusWhatsappConsultorio);

module.exports = router;
