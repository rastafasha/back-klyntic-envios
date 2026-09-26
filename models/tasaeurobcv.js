'use strict'
const mongoose = require('mongoose');
const { Schema } = mongoose;

const tasaeurobcvSchema = Schema({
    // 🏢 Identificador del propietario (ID de la Configuración de la Clínica o ID del Médico)
    usuario: { type: String, required: true }, 
    precio_dia: { type: Number, required: true, default: 0 },
}, { collection: 'tasaeurobcv', timestamps: true });

tasaeurobcvSchema.index({ usuario: 1, createdAt: -1 });

module.exports = mongoose.model('Tasaeurobcv', tasaeurobcvSchema);