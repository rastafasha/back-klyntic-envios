const axios = require('axios');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Tasadollarbcv = require('../models/tasadollarbcv'); 

/**
 * Función que extrae la data oficial de Venezuela y actualiza MongoDB Atlas
 */
async function sincronizarTasasOficiales() {
    try {
        console.log('🔄 Consultando endpoints estables de DolarApi con bypass de caché...');

        const timestamp = Date.now();
        const url = `https://dolarapi.com{timestamp}`;

        console.log(`📡 Realizando petición HTTP segura a: ${url}`);

        const resDolar = await axios.get(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            timeout: 8000
        });

        const data = resDolar.data;
        console.log('📦 JSON crudo recibido de DolarApi:', JSON.stringify(data));
        
        // 🎯 MAPEO CORREGIDO: DolarApi Venezuela usa "venta" o "compra" para el valor numérico
        let precioCrudo = data.venta || data.compra || data.promedio;

        if (!precioCrudo) {
            throw new Error(`La estructura del JSON cambió. No se encontró venta ni compra. Data: ${JSON.stringify(data)}`);
        }

        // Si viene como string con comas, lo limpiamos. Si es un número pasa directo
        if (typeof precioCrudo === 'string') {
            precioCrudo = precioCrudo.replace(',', '.');
        }

        // Convertimos de forma segura a flotante con dos decimales
        const valorNumerico = parseFloat(parseFloat(precioCrudo).toFixed(2));

        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            throw new Error(`El valor procesado no es válido numéricamente: ${valorNumerico}`);
        }

        // 2. ACTUALIZACIÓN ATÓMICA EN MONGO ATLAS
        await Tasadollarbcv.updateOne({}, { 
            $set: { precio_dia: valorNumerico } 
        }, { upsert: true });

        console.log(`✅ [BCV SYNC] Tasa guardada con éxito en Atlas: ${valorNumerico} VES`);
        
        return valorNumerico; // Retorna el número real hacia la ruta principal

    } catch (error) {
        console.error('❌ Error interno en el sync de tasas:', error.message);
        return null; // Si cae aquí, la ruta principal arrojará el error controlado
    }
}



module.exports = {
    sincronizarTasasOficiales
};
