'use strict'
const mongoose = require('mongoose');
const { Schema } = mongoose;

const tasapersonalizadaSchema = Schema({
    usuario: { 
        type: String, 
        required: true 
    }, 
    precio_dia: { 
        type: Number, 
        required: true, 
        default: 0 
    },
}, { collection: 'tasapersonalizada', timestamps: true });

// 💥 GARANTÍA: Evita duplicados creando un índice único por usuario
tasapersonalizadaSchema.index({ usuario: 1 }, { unique: true });

module.exports = mongoose.model('Tasapersonalizada', tasapersonalizadaSchema);
