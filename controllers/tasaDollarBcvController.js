const { response } = require('express');
const Tasadollarbcv = require('../models/tasadollarbcv'); 


const getTasas = async(req, res) => {

    const tasas = await Tasadollarbcv.find()
    res.json({
        ok: true,
        tasas
    });
};
const getUltimatasa = async(req, res) => {

    const tasa = await Tasadollarbcv.find()

    res.json({
        ok: true,
        tasa: tasa[tasa.length - 1] // Devuelve la última tasa del array
    });
};


const crearTasa = async(req, res) => {
    const uid = req.uid; // ID del usuario autenticado

    try {
        // 1. Extraemos el precio y limpiamos la coma decimal de forma estricta
        let precioEntrante = req.body.precio_dia || req.body.tasa;

        if (typeof precioEntrante === 'string') {
            precioEntrante = precioEntrante.replace(',', '.');
        }

        const valorNumerico = parseFloat(Number(precioEntrante).toFixed(2));

        // Validación matemática de seguridad
        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            return res.status(400).json({
                ok: false,
                msg: 'El formato de la tasa no es un número válido (ej: 775.33)'
            });
        }

        // 2. Creamos la tasa con el valor numérico ya sanitizado
        const tasa = new Tasadollarbcv({
            usuario: uid,
            precio_dia: valorNumerico // 🚀 Fijamos el valor real formateado aquí
        });

        const tasaDB = await tasa.save();

        // 3. ACTUALIZACIÓN CRUCIAL: Agregamos el ID de la tasa al PERFIL o USUARIO
        // ⚠️ CORRECCIÓN: Cambié 'Tasadollarbcv.findOneAndUpdate' por tu modelo real de Perfil/Usuario (ej: Perfil)
        // Si tu modelo de perfil se llama 'Perfil', asegúrate de importarlo arriba.
        const perfilActualizado = await Perfil.findOneAndUpdate(
            { usuario: uid }, 
            { $push: { tasas: tasaDB._id }, haveTasa: true }, // Asignamos la relación correctamente
            { new: true }
        );

        if (!perfilActualizado) {
            return res.status(404).json({
                ok: false,
                msg: 'No se encontró el perfil de configuración para este usuario'
            });
        }

        res.json({
            ok: true,
            tasa: tasaDB,
            perfil: 'Perfil médico actualizado con la nueva tasa cambiaria'
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            ok: false,
            msg: 'Error al crear la tasa, contacte al admin'
        });
    }
};


const actualizarTasa = async(req, res) => {
    const id = req.params.id; // ID de la Tasa
    const uid = req.uid;       // ID del Usuario que hace la petición

    try {
        const tasa = await Tasadollarbcv.findById(id);

        if (!tasa) {
            return res.status(404).json({
                ok: false,
                msg: 'Tasa no encontrada'
            });
        }

        // VALIDACIÓN DE SEGURIDAD: 
        // Solo el dueño del local o un ADMIN deberían poder editarlo
        // if (tasa.usuario.toString() !== uid && req.role !== 'ADMIN_ROLE') {
        //     return res.status(403).json({
        //         ok: false,
        //         msg: 'No tienes permisos para editar esta tasa'
        //     });
        // }

        // Preparamos los cambios (evitamos que el usuario cambie el dueño por error)
        const { usuario, ...campos } = req.body; 
        
        const tasaActualizada = await Tasadollarbcv.findByIdAndUpdate(
            id, 
            campos, 
            { new: true } // Para que devuelva el documento ya modificado
        );

        res.json({
            ok: true,
            tasa: tasaActualizada
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            ok: false,
            msg: 'Error al actualizar, hable con el administrador'
        });
    }
};

const borrarTasa = async(req, res) => {
    const id = req.params.id;
    const uid = req.uid;

    try {
        const tasaDB = await Tasadollarbcv.findById(id);
        if (!tasaDB) {
            return res.status(404).json({ ok: false, msg: 'Tasa no encontrada' });
        }

        // Seguridad
        // if (tasaDB.usuario.toString() !== uid && req.role !== 'ADMIN_ROLE') {
        //     return res.status(403).json({ ok: false, msg: 'No tiene permisos' });
        // }

        // Limpiar el Perfil
        await Profile.findOneAndUpdate(
            { usuario: tasaDB.usuario },
            { $pull: { tasa: id } }
        );

        // Borrar el documento
        await Tasadollarbcv.findByIdAndDelete(id);

        res.json({ ok: true, msg: 'Tasa eliminada y perfil actualizado' });

    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error al borrar tasa' });
    }
};




module.exports = {
    getTasas,
    crearTasa,
    actualizarTasa,
    borrarTasa,
    getUltimatasa
};