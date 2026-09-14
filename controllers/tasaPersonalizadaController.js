const Tasapersonalizada = require('../models/Tasapersonalizada'); // Asegúrate de que la ruta sea correcta

// 1. OBTENER la tasa de un usuario específico
const getTasaByUsuario = async (req, res) => {
    try {
        // 🚀 DETECCIÓN FLEXIBLE: Buscamos el ID en el token, en los parámetros de la URL, o en la query string
        const uid = req.uid || req.params.idUsuario || req.query.uid; 

        // Si el ID de verdad no viene en ningún lado, arrojamos un error claro de desarrollo
        if (!uid) {
            return res.status(400).json({
                ok: false,
                msg: 'Error: No se pudo identificar al usuario en la petición HTTP (uid ausente).'
            });
        }

        console.log(`🔍 Buscando tasa personalizada para el usuario ID: ${uid}`);

        // Buscamos el registro que pertenece a este usuario real
        const tasa = await Tasapersonalizada.findOne({ usuario: uid });

        // Si de verdad no existe en MongoDB Atlas
        if (!tasa) {
            return res.json({
                ok: true,
                hasCustomTasa: false,
                msg: 'El usuario no tiene una tasa configurada. Usar tasas oficiales por defecto.',
                tasa: {
                    usuario: uid,
                    precio_dia: 0 
                }
            });
        }

        // Si el usuario sí tiene su tasa guardada con éxito
        return res.json({
            ok: true,
            hasCustomTasa: true,
            tasa
        });

    } catch (error) {
        console.error('❌ Error al obtener tasa personalizada:', error.message);
        return res.status(500).json({ 
            ok: false, 
            msg: 'Error interno del servidor al consultar la tasa.' 
        });
    }
};



// 2. CREAR o ACTUALIZAR la tasa de un usuario (Upsert)
const crearTasa = async (req, res) => {
    // 🚀 DETECCIÓN FLEXIBLE: Intenta leer desde el middleware JWT, del body, o de los parámetros
    const uid = req.uid || req.body.usuario || req.body.uid || req.query.uid; 

    // Si después de buscar en todas partes sigue vacío, arrojamos un error claro
    if (!uid) {
        return res.status(400).json({
            ok: false,
            msg: 'Error de identificación: No se encontró el ID del usuario en la petición.'
        });
    }

    try {
        let precioEntrante = req.body.precio_dia || req.body.tasa;

        if (typeof precioEntrante === 'string') {
            precioEntrante = precioEntrante.replace(',', '.');
        }

        const valorNumerico = parseFloat(Number(precioEntrante).toFixed(2));

        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            return res.status(400).json({
                ok: false,
                msg: 'El formato de la tasa no es un número válido (ej: 775.33)'
            });
        }

        // Ejecutamos el Upsert usando el uid asegurado
        const tasaDB = await Tasapersonalizada.findOneAndUpdate(
            { usuario: uid },
            { $set: { precio_dia: valorNumerico } },
            { upsert: true, new: true, setDefaultsOnInsert: true } 
        );

        if (global.io) {
            global.io.to(uid).emit('tasa-personalizada-actualizada', { precio_dia: valorNumerico });
        }

        return res.json({
            ok: true,
            msg: 'Tasa personalizada guardada con éxito.',
            tasa: tasaDB
        });

    } catch (error) {
        console.error('❌ Error al crear/actualizar la tasa personalizada:', error.message);
        return res.status(500).json({
            ok: false,
            msg: 'Error al crear la tasa, contacte al admin'
        });
    }
};



const actualizarTasa = async (req, res) => {
    const uid = req.uid; // ID del Usuario autenticado extraído del token JWT

    try {
        // 1. Extraemos el precio del body y limpiamos posibles comas decimales
        let precioEntrante = req.body.precio_dia || req.body.tasa;

        if (typeof precioEntrante === 'string') {
            precioEntrante = precioEntrante.replace(',', '.');
        }

        const valorNumerico = parseFloat(Number(precioEntrante).toFixed(2));

        // Validación matemática de seguridad
        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            return res.status(400).json({
                ok: false,
                msg: 'El formato de la tasa no es un número válido (ej: 78.50)'
            });
        }

        // 2. Buscamos el documento por el ID del usuario y actualizamos su tasa
        const tasaActualizada = await Tasapersonalizada.findOneAndUpdate(
            { usuario: uid }, 
            { $set: { precio_dia: valorNumerico } }, 
            { new: true, runValidators: true } // runValidators asegura que cumpla el esquema de Mongoose
        );

        // Si el usuario no tenía una tasa configurada previamente
        if (!tasaActualizada) {
            return res.status(404).json({
                ok: false,
                msg: 'No se encontró ninguna tasa personalizada configurada para este usuario'
            });
        }

        // 3. Notificación inmediata a través de Sockets a las pantallas del usuario
        if (global.io) {
            global.io.to(uid).emit('tasa-personalizada-actualizada', { precio_dia: valorNumerico });
        }

        return res.json({
            ok: true,
            msg: 'Tasa personalizada modificada con éxito.',
            tasa: tasaActualizada
        });

    } catch (error) {
        console.error('❌ Error crítico en actualizarTasa:', error.message);
        return res.status(500).json({
            ok: false,
            msg: 'Error al actualizar la tasa, hable con el administrador'
        });
    }
};

// 3. ELIMINAR la tasa (para volver a usar las tasas oficiales por defecto)
const eliminarTasaPersonalizada = async (req, res) => {
    try {
        const { idUsuario } = req.params;

        const resultado = await Tasapersonalizada.findOneAndDelete({ usuario: idUsuario });

        if (!resultado) {
            return res.status(404).json({
                ok: false,
                msg: 'No se encontró ninguna tasa configurada para este usuario.'
            });
        }

        return res.json({
            ok: true,
            msg: 'Tasa personalizada eliminada. El sistema volverá a usar los valores oficiales.'
        });

    } catch (error) {
        console.error('❌ Error al eliminar tasa personalizada:', error.message);
        return res.status(500).json({ ok: false, msg: 'Error al eliminar el registro.' });
    }
};



module.exports = {
    getTasaByUsuario,
    eliminarTasaPersonalizada,
    crearTasa,
actualizarTasa
};
