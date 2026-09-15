const axios = require('axios');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Tasadollarbcv = require('../models/tasadollarbcv');
const Tasaeurobcv = require('../models/tasaeurobcv'); 

/**
 * Función que extrae la data oficial de USD y EUR y actualiza MongoDB Atlas
 */
// async function sincronizarTasasOficiales() {
//     try {
//         console.log('🔄 Consultando endpoints independientes para USD y EUR...');

//         const apiKey = process.env.EXCHANGE_RATE_KEY || '71ea6462a0b240201318fe91';

//         // CORRECCIÓN: Se agregó la estructura correcta de la URL (/v6/) y el símbolo $ para la interpolación
//         const urlUSD = `https://exchangerate-api.com{apiKey}/latest/USD`;
//         const resUSD = await axios.get(urlUSD, { timeout: 8000 });
//         const ratesUSD = resUSD.data?.conversion_rates;

//         const urlEUR = `https://exchangerate-api.com{apiKey}/latest/EUR`;
//         const resEUR = await axios.get(urlEUR, { timeout: 8000 });
//         const ratesEUR = resEUR.data?.conversion_rates;

//         if (!ratesUSD?.VES || !ratesEUR?.VES) {
//             throw new Error('No se pudo obtener el valor en VES para alguna de las dos monedas.');
//         }

//         // Extraemos los valores reales directamente de cada endpoint
//         const valorDolar = Math.round(parseFloat(ratesUSD.VES) * 100) / 100; 
//         const valorEuro = Math.round(parseFloat(ratesEUR.VES) * 100) / 100;  

//         console.log(`[Valores API] USD: ${valorDolar} VES | EUR: ${valorEuro} VES`);

//         // Guardamos en MongoDB Atlas
//         await Tasadollarbcv.updateOne({}, { $set: { precio_dia: valorDolar } }, { upsert: true });
//         await Tasaeurobcv.updateOne({}, { $set: { precio_dia: valorEuro } }, { upsert: true });
        
//         console.log('💾 MongoDB actualizado con los precios independientes.');
//         return { usd: valorDolar, eur: valorEuro };

//     } catch (error) {
//         // Alerta: ExchangeRate-API a veces ofrece el promedio del mercado y no la tasa exacta del BCV
//         console.error('❌ Error en la sincronización:', error.message);
//         return null; 
//     }
// }


const axios = require('axios');
const cheerio = require('cheerio'); // Necesitarás instalarlo: npm i cheerio
const https = require('https');

async function sincronizarTasasOficiales() {
    try {
        console.log('🔄 Consultando directamente el portal oficial del BCV...');

        // El BCV a veces tiene problemas con certificados SSL viejos, esto evita que falle la petición
        const agent = new https.Agent({ rejectUnauthorized: false });
        
        const response = await axios.get('https://bcv.org.ve', { 
            timeout: 10000,
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // Buscamos los contenedores específicos del BCV para USD y EUR
        const usdTexto = $('#dolar strong').text().trim().replace(',', '.');
        const eurTexto = $('#euro strong').text().trim().replace(',', '.');

        if (!usdTexto || !eurTexto) {
            throw new Error('No se pudieron encontrar los contenedores de tasas en el HTML del BCV.');
        }

        const valorDolar = parseFloat(usdTexto);
        const valorEuro = parseFloat(eurTexto);

        console.log(`[Valores BCV] USD: ${valorDolar} VES | EUR: ${valorEuro} VES`);

        // Guardamos de forma segura en MongoDB Atlas
        await Tasadollarbcv.updateOne({}, { $set: { precio_dia: valorDolar } }, { upsert: true });
        await Tasaeurobcv.updateOne({}, { $set: { precio_dia: valorEuro } }, { upsert: true });
        
        console.log('💾 MongoDB actualizado con datos oficiales directos del BCV.');
        return { usd: valorDolar, eur: valorEuro };

    } catch (error) {
        console.error('❌ Error en la sincronización desde el BCV:', error.message);
        return null; 
    }
}



module.exports = {
    sincronizarTasasOficiales
};
