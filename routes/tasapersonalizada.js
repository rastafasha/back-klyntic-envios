/*
 Ruta: /api/tasapersonalizada
 */

const { Router } = require('express');
const router = Router();
const {
    getTasaByUsuario,
    eliminarTasaPersonalizada,
    crearTasa,
actualizarTasa
} = require('../controllers/tasaPersonalizadaController');

const { validarJWT } = require('../middlewares/validar-jwt');
const { check } = require('express-validator');
const { validarCampos } = require('../middlewares/validar-campos');

router.get('/:idUsuario', getTasaByUsuario);

router.post('/crear', [
    // validarJWT,
    validarCampos
], crearTasa);

router.put('/editar/:id', [
    validarJWT,
    check('nombre', 'El nombre de la Tasa es necesario').not().isEmpty(),
    validarCampos
], actualizarTasa);



router.delete('/borrar/:id',  eliminarTasaPersonalizada);


module.exports = router;