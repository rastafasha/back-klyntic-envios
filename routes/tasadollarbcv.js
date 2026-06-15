/*
 Ruta: /api/tasadollarbcv
 */

const { Router } = require('express');
const router = Router();
const {
    getTasas,
    crearTasa,
    actualizarTasa,
    borrarTasa,
    getUltimatasa,
} = require('../controllers/tasaDollarBcvController');

const { validarJWT } = require('../middlewares/validar-jwt');
const { check } = require('express-validator');
const { validarCampos } = require('../middlewares/validar-campos');

router.get('/', getTasas);
router.get('/ultimatasa', getUltimatasa);

router.post('/crear', [
    // validarJWT,
    validarCampos
], crearTasa);

router.put('/editar/:id', [
    validarJWT,
    check('nombre', 'El nombre de la Tasa es necesario').not().isEmpty(),
    validarCampos
], actualizarTasa);

router.delete('/borrar/:id', validarJWT, borrarTasa);


module.exports = router;