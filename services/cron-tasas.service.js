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

        // 🚀 URL COMPLETA Y FIJA DIRECTA DE DATOS
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

        if (!rates || !rates.USD || !rates.EUR) {
            throw new Error('La estructura financiera global no devolvió los pares de conversión.');
        }

        // Inversión matemática para obtener el valor en Bolívares
        const valorDolar = Math.round((1 / parseFloat(rates.USD)) * 100) / 100;
        const valorEuro = Math.round((1 / parseFloat(rates.EUR)) * 100) / 100;

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
