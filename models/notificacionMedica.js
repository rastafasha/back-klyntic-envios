const mongoose = require('mongoose');

const NotificacionMedicaSchema = new mongoose.Schema({
    usuario: { type: String, required: true }, // ID del médico o paciente (proveniente de tu correlativo MySQL)
    titulo: { type: String, required: true },
    mensaje: { type: String, required: true },
    leido: { type: Boolean, default: false },
    tipo: { type: String, enum: ['CITA_AGENDADA', 'LLAMADO_MEDICO', 'RECORDATORIO'], default: 'RECORDATORIO' },
    fecha: { type: Date, default: Date.now }
}, { collection: 'klyntic_notificaciones' }); // 🔥 Forzamos el nombre de la colección separada

module.exports = mongoose.model('NotificacionMedica', NotificacionMedicaSchema);
