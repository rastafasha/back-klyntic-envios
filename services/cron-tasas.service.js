const axios = require('axios');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Tasadollarbcv = require('../models/tasadollarbcv'); 


/**
 * Función que extrae la data oficial de USD y EUR y actualiza MongoDB Atlas
 */
async function sincronizarTasasOficiales() {
    try {
        console.log('🔄 Consultando tasas oficiales globales desde Exchangerate-API...');

        // 🚀 URL COMPLETA Y CORRECTA (Moneda base: USD)
        const url = 'https://er-api.com';

        console.log('📡 Realizando petición HTTP segura a: ' + url);

        const response = await axios.get(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            timeout: 8000
        });

        const rates = response.data?.rates;

        // 🔥 Validamos que contenga la moneda de Venezuela (VES) y el Euro (EUR)
        if (!rates || !rates.VES || !rates.EUR) {
            throw new Error('La estructura financiera global no devolvió los pares de conversión para VES o EUR.');
        }

        // 🔥 ¡CORRECCIÓN MATEMÁTICA! 
        // La API ya viene en base USD, por lo que rates.VES es directamente el precio del dólar en bolívares.
        const valorDolar = Math.round(parseFloat(rates.VES) * 100) / 100;
        
        // Para el euro, dividimos la tasa de VES entre la tasa de EUR para obtener cuántos bolívares vale un euro.
        const valorEuro = Math.round((parseFloat(rates.VES) / parseFloat(rates.EUR)) * 100) / 100;

        console.log(`[Conversión Global Exitosa] USD: ${valorDolar} VES | EUR: ${valorEuro} VES`);

        if (isNaN(valorDolar) || isNaN(valorEuro) || valorDolar <= 0 || valorEuro <= 0) {
            throw new Error('El cálculo matemático arrojó valores inválidos.');
        }

        // Actualización en tu base de datos de MongoDB Atlas
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
