/*
 Ruta: /api/envio
 */

const { Router } = require('express');
const router = Router();

// 🚀 CORRECCIÓN: Cambiado 'enviarFactura' por el nombre real médico: 'enviarDocumentoPaciente'
const {
    enviarDocumentoPaciente
} = require('../controllers/envioController');

const { validarJWT } = require('../middlewares/validar-jwt');
const { check } = require('express-validator');
const { validarCampos } = require('../middlewares/validar-campos');

const multer = require('multer');
// Configurar Multer para manejar archivos en memoria de forma limpia
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 🚀 ACTUALIZADO: Cambiamos el endpoint a uno más adecuado para el CRM médico
// Espera recibir el archivo PDF/Imagen en el campo FormData llamado 'documentoMedico'
router.post('/enviar_documento', upload.single('documentoMedico'), enviarDocumentoPaciente);

module.exports = router;
