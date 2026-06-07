const Consultorio = require('../models/consultorio');
// Importamos de forma limpia las dos funciones del helper
const { crearClienteWhatsApp, enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');

// 🚀 1. Arranca el proceso de conexión desde Angular
const conectarWhatsappConsultorio = async (req, res) => {
    try {
        const localId = req.params.id;

        await Consultorio.findByIdAndUpdate(localId, {
            whatsappStatus: 'ESPERANDO_QR',
            whatsappQR: '' 
        });

        // Llamada a la función del helper sin colisiones de nombre
        crearClienteWhatsApp(localId);

        return res.status(200).json({
            _id: localId,
            whatsappStatus: 'ESPERANDO_QR'
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

// 🔒 2. El Polling repetitivo de Angular para leer el QR
const statusWhatsappConsultorio = async (req, res) => {
    try {
        const consultorio = await Consultorio.findById(req.params.id).select('whatsappStatus whatsappQR');
        return res.status(200).json(consultorio);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

// 📡 3. Sincronización Servidor a Servidor (Cuando creas un médico en Laravel)
const sincronizarNuevoConsultorio = async (req, res) => {
    try {
        const { doctor_id } = req.body;
        if (!doctor_id) return res.status(400).json({ status: 'error', message: 'ID requerido' });

        res.status(200).json({ status: 'ok' });

        const existe = await Consultorio.findById(doctor_id);
        if (!existe) {
            await Consultorio.create({
                _id: doctor_id,
                whatsappStatus: 'DESCONECTADO',
                whatsappQR: '',
                whatsappConnectedAt: null
            });
            console.log(`Consultorio médico ${doctor_id} inicializado.`);
        }
    } catch (error) {
        console.error('Error sincronizando consultorio:', error);
    }
};

// 🔄 4. Restauración automática al encender el servidor de Render
const restaurarSesionesDeDoctores = async () => {
    try {
        console.log('=== 🔄 KLYNTIC: Restaurando sesiones activas ===');
        const activos = await Consultorio.find({ whatsappStatus: 'CONECTADO' });
        for (const con of activos) {
            crearClienteWhatsApp(con._id);
        }
    } catch (error) {
        console.error('Error restaurando sesiones:', error);
    }
};

// Se ejecuta de inmediato al levantar el archivo
restaurarSesionesDeDoctores();

module.exports = {
    conectarWhatsappConsultorio,
    statusWhatsappConsultorio,
    sincronizarNuevoConsultorio
};
