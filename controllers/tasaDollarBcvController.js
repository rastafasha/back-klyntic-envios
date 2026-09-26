const { response } = require('express');
const Tasadollarbcv = require('../models/tasadollarbcv');

const getTasas = async (req, res) => {
    try {
        // Captura el ID de forma flexible (prioriza la query string que envía tu Angular)
        const uid = req.query.usuario || req.query.uid || req.params.id || req.uid;

        if (!uid) {
            return res.status(400).json({ ok: false, msg: 'No se especificó el ID del propietario de la tasa.' });
        }

        const tasas = await Tasadollarbcv.find({ usuario: uid }).sort({ createdAt: -1 });
        return res.json({ ok: true, tasas });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, msg: 'Error al consultar el historial de tasas.' });
    }
};

const getUltimatasa = async(req, res) => {
    try {
        const uid = req.query.usuario || req.query.uid || req.params.id || req.uid;

        if (!uid) {
            return res.status(400).json({ ok: false, msg: 'No se especificó el ID del propietario.' });
        }

        // 🎯 INTENTO 1: Buscamos si existe una tasa oficial cargada específicamente para este Tenant/Médico
        let tasa = await Tasadollarbcv.findOne({ usuario: uid }).sort({ createdAt: -1 });

        // 🚀 INTENTO 2 (FALLBACK GLOBAL): Si no hay tasa para este usuario, 
        // traemos la última tasa universal inyectada por el Cronjob en el servidor
        if (!tasa) {
            console.log(`⚠️ No hay tasa específica para el usuario ${uid}. Extrayendo última tasa global del Cronjob...`);
            
            // Buscamos la última tasa registrada de forma absoluta, saltándonos el filtro de usuario
            tasa = await Tasadollarbcv.findOne().sort({ createdAt: -1 });
        }

        return res.json({
            ok: true,
            // Si el servidor está completamente vacío y en frío, devuelve 0 de respaldo seguro
            tasa: tasa || { usuario: uid, precio_dia: 0 } 
        });
    } catch (error) {
        console.error('Error en getUltimatasa:', error);
        return res.status(500).json({ ok: false, msg: 'Error al extraer la tasa de cambio activa.' });
    }
};


/**
 * 💾 Registra un nuevo valor de liquidación amarrado al contexto correcto
 */
const crearTasa = async (req, res) => {
    // 🚀 DETECCIÓN MULTI-TENANT: Prioriza el propietario enviado en el body por el formulario de la secretaria
    const uid = req.body.usuario || req.body.uid || req.uid;

    try {
        let precioEntrante = req.body.precio_dia || req.body.tasa;

        if (typeof precioEntrante === 'string') {
            precioEntrante = precioEntrante.replace(',', '.');
        }

        const valorNumerico = parseFloat(Number(precioEntrante).toFixed(2));

        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            return res.status(400).json({
                ok: false,
                msg: 'El formato de la tasa no es un número válido (ej: 36.50)'
            });
        }

        // Creamos e indexamos la tasa asociando el dueño real resolved en la base de datos
        const tasa = new Tasadollarbcv({
            usuario: uid,
            precio_dia: valorNumerico
        });

        const tasaDB = await tasa.save();

        res.json({
            ok: true,
            tasa: tasaDB,
            msg: 'Tasa oficial de dólares sincronizada correctamente en el entorno del establecimiento.'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'Error al registrar la tasa, contacte al admin' });
    }
};


const actualizarTasa = async (req, res) => {
    const id = req.params.id;
    try {
        const tasa = await Tasadollarbcv.findById(id);
        if (!tasa) {
            return res.status(404).json({ ok: false, msg: 'Tasa no encontrada' });
        }

        const { usuario, ...campos } = req.body;
        const tasaActualizada = await Tasadollarbcv.findByIdAndUpdate(id, campos, { new: true });

        res.json({ ok: true, tasa: tasaActualizada });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'Error al actualizar, hable con el administrador' });
    }
};

const borrarTasa = async (req, res) => {
    const id = req.params.id;
    try {
        const tasaEliminada = await Tasadollarbcv.findOneAndDelete({ _id: id });
        if (!tasaEliminada) {
            return res.status(404).json({ ok: false, msg: 'Tasa no encontrada' });
        }
        return res.json({ ok: true, msg: 'Tasa eliminada del historial con éxito.' });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: 'Error al borrar tasa' });
    }
};






module.exports = {
    getTasas,
    crearTasa,
    actualizarTasa,
    borrarTasa,
    getUltimatasa
};