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

        // 🚀 LA CLAVE: Rompemos el caché de red añadiendo un parámetro aleatorio de tiempo
        const timestamp = Date.now();
        const url = `https://dolarapi.com{timestamp}`;

        const resDolar = await axios.get(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        // Extraemos y redondeamos el valor de la API (Soporta múltiples estructuras)
        const data = resDolar.data;
        const valorDolar = parseFloat((data.promedio || data.oficial || data.precio).toFixed(2));
        
        console.log(`[DolarApi Verificado] USD extraído: ${valorDolar} VES`);

        // Validación estricta anti-corrupción de datos
        if (isNaN(valorDolar) || valorDolar <= 0) {
            throw new Error('La API devolvió un formato no numérico o valores inválidos.');
        }

        // Actualización o inserción en MongoDB Atlas
        await Tasadollarbcv.updateOne({}, { 
            $set: { precio_dia: valorDolar } 
        }, { upsert: true });

        console.log(`✅ MongoDB Atlas actualizado exitosamente a: ${valorDolar} VES`);
        return { usd: valorDolar };

    } catch (error) {
        console.error('❌ Error en el sync automático de tasas:', error.message);
        return null;
    }
}

// Exportamos la función limpia para consumirla desde el router de Express
module.exports = { sincronizarTasasOficiales };
