const axios = require('axios');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Tasadollarbcv = require('../models/tasadollarbcv');
const Tasaeurobcv = require('../models/tasaeurobcv'); 

/**
 * Función que extrae la data oficial de USD y EUR y actualiza MongoDB Atlas
 */
async function sincronizarTasasOficiales() {
    try {
        console.log('🔄 Consultando endpoints independientes para USD y EUR...');

        const apiKey = process.env.EXCHANGE_RATE_KEY || '71ea6462a0b240201318fe91';

        // 1. Petición exclusiva para el valor del Dólar (Base USD)
        const urlUSD = `https://exchangerate-api.com{apiKey}/latest/USD`;
        const resUSD = await axios.get(urlUSD, { timeout: 8000 });
        const ratesUSD = resUSD.data?.conversion_rates;

        // 2. Petición exclusiva para el valor del Euro (Base EUR)
        const urlEUR = `https://exchangerate-api.com{apiKey}/latest/EUR`;
        const resEUR = await axios.get(urlEUR, { timeout: 8000 });
        const ratesEUR = resEUR.data?.conversion_rates;

        if (!ratesUSD?.VES || !ratesEUR?.VES) {
            throw new Error('No se pudo obtener el valor en VES para alguna de las dos monedas.');
        }

        // Extraemos los valores reales directamente de cada endpoint
        const valorDolar = Math.round(parseFloat(ratesUSD.VES) * 100) / 100; // Cuántos VES son 1 USD
        const valorEuro = Math.round(parseFloat(ratesEUR.VES) * 100) / 100;  // Cuántos VES son 1 EUR

        console.log(`[Valores API] USD: ${valorDolar} VES | EUR: ${valorEuro} VES`);

        // Guardamos de forma segura en MongoDB Atlas
        await Tasadollarbcv.updateOne({}, { $set: { precio_dia: valorDolar } }, { upsert: true });
        await Tasaeurobcv.updateOne({}, { $set: { precio_dia: valorEuro } }, { upsert: true });
        
        console.log('💾 MongoDB actualizado con los precios independientes.');
        return { usd: valorDolar, eur: valorEuro };

    } catch (error) {
        console.error('❌ Error en la sincronización:', error.message);
        return null; 
    }
}










module.exports = {
    sincronizarTasasOficiales
};
