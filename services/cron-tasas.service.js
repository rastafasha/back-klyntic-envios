const axios = require('axios');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Tasadollarbcv = require('../models/tasadollarbcv'); 


/**
 * Función que extrae la data oficial de USD y EUR y actualiza MongoDB Atlas
 */
async function sincronizarTasasOficiales() {
    try {
        console.log('🔄 Consultando tasas oficiales globales desde ExchangeRate-API (v6)...');

        // 🔥 EXTRAEMOS LA KEY DE FORMA SEGURA DESDE LAS VARIABLES DE ENTORNO (.env)
        const apiKey = process.env.EXCHANGE_RATE_KEY;

        if (!apiKey) {
            throw new Error('La variable de entorno EXCHANGE_RATE_KEY no está configurada.');
        }

        // 🚀 CONCATENAMOS LA URL DINÁMICAMENTE USANDO LA VARIABLE SEGURA
        const url = `https://exchangerate-api.com/v6/{apiKey}/latest/USD`;

        console.log('📡 Realizando petición HTTP segura a un endpoint autenticado (v6)...');

        const response = await axios.get(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            timeout: 8000
        });

        // Sincronizado con la documentación v6: conversion_rates
        const rates = response.data?.conversion_rates;

        if (!rates || !rates.VES || !rates.EUR) {
            throw new Error('La estructura financiera v6 no devolvió los pares de conversión para VES o EUR.');
        }

        // Conversión matemática exacta basada en USD
        const valorDolar = Math.round(parseFloat(rates.VES) * 100) / 100;
        const valorEuro = Math.round((parseFloat(rates.VES) / parseFloat(rates.EUR)) * 100) / 100;

        console.log(`[Conversión v6 Exitosa] USD: ${valorDolar} VES | EUR: ${valorEuro} VES`);

        if (isNaN(valorDolar) || isNaN(valorEuro) || valorDolar <= 0 || valorEuro <= 0) {
            throw new Error('El cálculo matemático arrojó valores inválidos.');
        }

        // Actualización automática en tu base de datos de MongoDB Atlas
        await Tasadollarbcv.updateOne({}, { $set: { precio_dia: valorDolar } }, { upsert: true });

        if (typeof Tasaeurobcv !== 'undefined') {
            await Tasaeurobcv.updateOne({}, { $set: { precio_dia: valorEuro } }, { upsert: true });
        }

        return { usd: valorDolar, eur: valorEuro };

    } catch (error) {
        console.error('❌ Error en el sync automático de tasas:', error.message);
        return null; 
    }
}









module.exports = {
    sincronizarTasasOficiales
};
