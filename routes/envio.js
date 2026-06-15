/*
 Ruta: /api/envio
 */

const { Router } = require('express');
const router = Router();
const {
    enviarFactura,

} = require('../controllers/envioController');

const { validarJWT } = require('../middlewares/validar-jwt');
const { check } = require('express-validator');
const { validarCampos } = require('../middlewares/validar-campos');

// importamos multer, agregado por José Prados
const multer = require('multer');
// Configurar Multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/enviar_factura', upload.single('facturacliente'), enviarFactura);













module.exports = router;