const mongoose = require('mongoose');

const NotificacionMedicaSchema = new mongoose.Schema({
    // ID del médico o paciente (proveniente de tu correlativo MySQL)
    usuario: { type: String, required: true }, 
    
    // Rol para saber a quién va dirigida y segmentar rápido en las consultas
    // Ej: 'MEDICO' o 'PACIENTE'
    rolDestinatario: { type: String, enum: ['DOCTOR', 'GUEST'], required: true },

    titulo: { type: String, required: true },
    mensaje: { type: String, required: true },
    leido: { type: Boolean, default: false },
    
    // Expandimos los tipos para cubrir los flujos de Klyntic
    tipo: { 
        type: String, 
        enum: [
            'CITA_AGENDADA', 
            'LLAMADO_MEDICO', 
            'RECORDATORIO',
            'PAGO_RECIBIDO',      // Alerta para el médico / Confirmación para el paciente
            'PAGO_PENDIENTE',     // Recordatorio de cobro para el paciente
            'PAGO_RECHAZADO',     // Notificacion para el paciente
            'PRESUPUESTO_NUEVO',  // Cuando el médico le genera una cotización al paciente
            'PRESUPUESTO_APROBADO',  // Cuando el médico le genera una cotización al paciente
            'CONSULTA_NUEVA', // Historial o indicaciones listas para el médico
            'CONSULTA_FINALIZADA' // Historial o indicaciones listas para el paciente
        ], 
        default: 'RECORDATORIO' 
    },

    // 🔥 CAMPOS CLAVE: Guardamos el ID de MySQL del objeto que disparó la alerta.
    // Al ser opcionales, si la notificación es un 'RECORDATORIO' genérico, se quedan vacíos.
    referenciaId: { type: String, default: null }, // ID de la Cita, Pago o Presupuesto en MySQL

    fecha: { type: Date, default: Date.now }
}, { 
    collection: 'klyntic_notificaciones',
    timestamps: true // Esto te crea automáticamente 'createdAt' y 'updatedAt' en Mongo
});

// Índice para acelerar la carga de la campana de notificaciones en Angular
NotificacionMedicaSchema.index({ usuario: 1, leido: 1 });

module.exports = mongoose.model('NotificacionMedica', NotificacionMedicaSchema);
