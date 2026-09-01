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
        
        // 🚀 RUTA OFICIAL CORRECTA PARA EL DÓLAR BCV EN VENEZUELA
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
        
        // 🔍 DolarApi para un solo endpoint devuelve las propiedades directas (usualmente "promedio" o "venta")
        let precioCrudo = data.promedio || data.venta || data.precio || data.oficial;

        if (!precioCrudo) {
            throw new Error(`La estructura del JSON cambió o el endpoint falló. Data recibida: ${JSON.stringify(data)}`);
        }

        if (typeof precioCrudo === 'string') {
            precioCrudo = precioCrudo.replace(',', '.');
        }

        const valorNumerico = parseFloat(Number(precioCrudo).toFixed(2));

        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            throw new Error(`El valor procesado no es válido: ${valorNumerico}`);
        }

        // 2. 🎯 ACTUALIZACIÓN ATÓMICA EN MONGO ATLAS
        await Tasadollarbcv.updateOne({}, { 
            $set: { precio_dia: valorNumerico } 
        }, { upsert: true });

        console.log(`✅ [BCV SYNC] Tasa guardada con éxito en Atlas: ${valorNumerico} VES`);
        
        return valorNumerico;

    } catch (error) {
        // Captura errores de red, respuestas HTTP incorrectas (404/500) o fallos de sintaxis previa
        console.error('❌ Error en el sync de tasas:', error.message);
        return null;
    }
}


module.exports = {
    sincronizarTasasOficiales
};
