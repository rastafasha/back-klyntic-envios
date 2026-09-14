'use strict'
var mongoose = require('mongoose');
const { Schema, model } = require('mongoose');

const tasaeurobcvSchema = Schema({
    precio_dia: { type: Number, required: true, default: 0 },
}, { collection: 'tasaeurobcv', timestamps: true  });



module.exports = mongoose.model('Tasaeurobcv', tasaeurobcvSchema);