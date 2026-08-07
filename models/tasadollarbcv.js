'use strict'
var mongoose = require('mongoose');
const { Schema, model } = require('mongoose');

const tasadollarbcvSchema = Schema({
    precio_dia: { type: Number, required: true, default: 0 },
}, { collection: 'tasadollarbcv', timestamps: true  });



module.exports = mongoose.model('Tasadollarbcv', tasadollarbcvSchema);