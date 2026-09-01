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
        console.log('📦 [BCV DEBUG] CONTENIDO CRUDO DE LA API:', JSON.stringify(data));
        
        // 🎯 EXTRACCIÓN DIRECTA SEGURA:
        // Evaluamos de manera simple las propiedades que DolarApi suele inyectar
        let precioCrudo = data.venta || data.promedio || data.compra || data.precio;

        if (!precioCrudo) {
            throw new Error(`Propiedades de precio no encontradas. Estructura: ${JSON.stringify(data)}`);
        }

        // Si por casualidad la API lo manda como String ("47,25"), lo adaptamos a formato numérico
        if (typeof precioCrudo === 'string') {
            precioCrudo = precioCrudo.replace(',', '.');
        }

        // Convertimos directamente a número flotante
        const valorNumerico = parseFloat(precioCrudo);

        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            throw new Error(`El valor procesado no se pudo transformar a número: ${precioCrudo}`);
        }

        // Formateamos estrictamente a 2 decimales para Mongo Atlas
        const valorFinal = Math.round(valorNumerico * 100) / 100;

        // 2. ACTUALIZACIÓN EN MONGO ATLAS
        await Tasadollarbcv.updateOne({}, { 
            $set: { precio_dia: valorFinal } 
        }, { upsert: true });

        console.log(`✅ [BCV SYNC] Tasa guardada con éxito en Atlas: ${valorFinal} VES`);
        
        return valorFinal; // Retornamos el número limpio hacia el router.get

    } catch (error) {
        console.error('❌ Error interno en el sync de tasas:', error.message);
        return null; 
    }
}



module.exports = {
    sincronizarTasasOficiales
};
