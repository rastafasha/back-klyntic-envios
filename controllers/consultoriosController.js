const { crearClienteWhatsApp } = require('../helpers/whatsapp-helper');
const Consultorio = require('../models/consultorio'); // Tu modelo médico en Mongo

const conectarWhatsappConsultorio = async (req, res) => {
    try {
        const localId = req.params.id; 

        // Arrancamos el proceso dinámico multitenant
        crearClienteWhatsApp(localId);

        // Forzamos el retorno inmediato para activar el bucle de Angular
        return res.status(200).json({
            _id: localId,
            whatsappStatus: 'ESPERANDO_QR',
            whatsappQR: ''
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const statusWhatsappConsultorio = async (req, res) => {
    try {
        const consultorio = await Consultorio.findById(req.params.id).select('whatsappStatus whatsappQR');
        return res.status(200).json(consultorio);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

module.exports = {
    conectarWhatsappConsultorio,
    statusWhatsappConsultorio
};
