const mongoose = require('mongoose');

const ConsultorioSchema = new mongoose.Schema({
    // Este ID puede ser el string del ID numérico que viene de MySQL/Laravel
    _id: { type: String, required: true }, 
    whatsappStatus: { 
        type: String, 
        // 🚀 CORRECCIÓN: Agregamos INICIALIZANDO y ERROR para soportar todo el ciclo de vida del bot
        enum: ['INICIALIZANDO', 'ESPERANDO_QR', 'CONECTADO', 'DESCONECTADO', 'ERROR'], 
        default: 'DESCONECTADO' 
    },
    whatsappQR: { type: String, default: '' },
    whatsappConnectedAt: { type: Date }
}, { collection: 'klyntic_consultorios' }); // Forzamos su propia colección médica en Mongo

module.exports = mongoose.model('Consultorio', ConsultorioSchema);