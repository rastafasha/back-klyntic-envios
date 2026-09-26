'use strict'
const mongoose = require('mongoose');
const { Schema } = mongoose;

const tasadollarbcvSchema = Schema({
    // 🏢 Identificador del propietario (ID de la Configuración de la Clínica o ID del Médico)
    usuario: { type: String, required: true }, 
    precio_dia: { type: Number, required: true, default: 0 },
}, { collection: 'tasadollarbcv', timestamps: true });

// Creamos un índice para acelerar las búsquedas por propietario en MAMP
tasadollarbcvSchema.index({ usuario: 1, createdAt: -1 });

module.exports = mongoose.model('Tasadollarbcv', tasadollarbcvSchema);