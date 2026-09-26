const { response } = require('express');
const Tasaeurobcv = require('../models/tasaeurobcv'); 

const getTasas = async(req, res) => {
    try {
        const uid = req.query.usuario || req.query.uid || req.params.id || req.uid;
        if (!uid) {
            return res.status(400).json({ ok: false, msg: 'No se especificó el ID del propietario de la tasa Euro.' });
        }

        const tasas = await Tasaeurobcv.find({ usuario: uid }).sort({ createdAt: -1 });
        return res.json({ ok: true, tasas });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: 'Error al consultar las tasas Euro.' });
    }
};

const getUltimatasa = async(req, res) => {
    try {
        const uid = req.query.usuario || req.query.uid || req.params.id || req.uid;

        if (!uid) {
            return res.status(400).json({ ok: false, msg: 'No se especificó el ID del propietario.' });
        }

        // 🎯 INTENTO 1: Tasa Euro específica de la sucursal/médico
        let tasa = await Tasaeurobcv.findOne({ usuario: uid }).sort({ createdAt: -1 });

        // 🚀 INTENTO 2 (FALLBACK GLOBAL): Última tasa Euro recolectada por el Cronjob del BCV
        if (!tasa) {
            tasa = await Tasaeurobcv.findOne().sort({ createdAt: -1 });
        }

        return res.json({
            ok: true,
            tasa: tasa || { usuario: uid, precio_dia: 0 }
        });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: 'Error al extraer la tasa Euro activa.' });
    }
};

const crearTasa = async(req, res) => {
    const uid = req.body.usuario || req.body.uid || req.uid;

    try {
        let precioEntrante = req.body.precio_dia || req.body.tasa;
        if (typeof precioEntrante === 'string') {
            precioEntrante = precioEntrante.replace(',', '.');
        }

        const valorNumerico = parseFloat(Number(precioEntrante).toFixed(2));
        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            return res.status(400).json({ ok: false, msg: 'Formato numérico de tasa Euro inválido.' });
        }

        const tasa = new Tasaeurobcv({
            usuario: uid,
            precio_dia: valorNumerico 
        });

        const tasaDB = await tasa.save();

        return res.json({ ok: true, tasa: tasaDB });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: 'Error en el servidor al registrar tasa Euro.' });
    }
};

const actualizarTasa = async(req, res) => {
    const id = req.params.id;
    try {
        const tasa = await Tasaeurobcv.findById(id);
        if (!tasa) return res.status(404).json({ ok: false, msg: 'No encontrado' });

        const { usuario, ...campos } = req.body;
        const tasaActualizada = await Tasaeurobcv.findByIdAndUpdate(id, campos, { new: true });
        return res.json({ ok: true, tasa: tasaActualizada });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: 'Error al actualizar.' });
    }
};

const borrarTasa = async (req, res) => {
    const id = req.params.id;
    try {
        const tasaEliminada = await Tasaeurobcv.findOneAndDelete({ _id: id });
        if (!tasaEliminada) return res.status(404).json({ ok: false, msg: 'No encontrado' });
        return res.json({ ok: true, msg: 'Registro de tasa Euro eliminado.' });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: 'Error al borrar.' });
    }
};





module.exports = {
    getTasas,
    crearTasa,
    actualizarTasa,
    borrarTasa,
    getUltimatasa
};