const axios = require('axios');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Definición de tu modelo Mongoose
const Tasadollarbcv = mongoose.model('tasadollarbcv', Schema({
    precio_dia: { type: Number, required: true, default: 0 }
}, { collection: 'tasadollarbcv', timestamps: true }));

/**
 * Función que extrae la data oficial y actualiza MongoDB Atlas
 */

async function sincronizarTasasOficiales() {
    try {
        console.log('🔄 Consultando endpoints estables de DolarApi con bypass de caché...');

        // 1. Generamos el marcador de tiempo numérico
        const timestamp = Date.now();

        // 2. 🚀 CORRECCIÓN CRÍTICA: El timestamp DEBE ir al final de toda la ruta con un '?'
        // Asegúrate de usar comillas invertidas (backticks) para la plantilla de texto
        const url = `https://dolarapi.com{timestamp}`;

        console.log(`📡 Realizando petición HTTP segura a: ${url}`);

        const resDolar = await axios.get(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 8000
        });

        const data = resDolar.data;
        let precioCrudo = data.oficial || data.promedio || data.precio || data.oficial_bcv;

        if (!precioCrudo) {
            throw new Error('La estructura del JSON cambió o los campos oficiales no están disponibles.');
        }

        // Sanitizamos comas por puntos antes del guardado en Mongo (Evita el CastError)
        if (typeof precioCrudo === 'string') {
            precioCrudo = precioCrudo.replace(',', '.');
        }

        const valorNumerico = parseFloat(Number(precioCrudo).toFixed(2));

        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            throw new Error(`El valor procesado no es válido: ${valorNumerico}`);
        }

        // Actualización atómica en tu colección única de Atlas
        await Tasadollarbcv.updateOne({}, { 
            $set: { precio_dia: valorNumerico } 
        }, { upsert: true });

        console.log(`✅ [BCV SYNC] Tasa guardada con éxito en Atlas: ${valorNumerico} VES`);
        return { usd: valorNumerico };

    } catch (error) {
        // El log ahora te mostrará la URL limpia si vuelve a fallar la red corporativa
        console.error('❌ Error en el sync de tasas:', error.message);
        return null;
    }
}

// Exportamos la función limpia para consumirla desde el router de Express
module.exports = { sincronizarTasasOficiales };
