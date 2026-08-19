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
        const timestamp = Date.now();
        const url = `https://dolarapi.com{timestamp}`;

        const resDolar = await axios.get(url, {
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            timeout: 7000
        });

        const data = resDolar.data;
        let precioCrudo = data.oficial || data.promedio || data.precio;

        // 🚀 SANITIZACIÓN CRÍTICA: Reemplaza comas por puntos si la API manda un String
        if (typeof precioCrudo === 'string') {
            precioCrudo = precioCrudo.replace(',', '.');
        }

        const valorNumerico = parseFloat(Number(precioCrudo).toFixed(2));

        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            throw new Error('El valor extraído no es un número válido.');
        }

        // Guardamos o actualizamos el registro único en Atlas
        await Tasadollarbcv.updateOne({}, { 
            $set: { precio_dia: valorNumerico } 
        }, { upsert: true });

        console.log(`✅ [BCV SYNC] Tasa guardada con éxito en Atlas: ${valorNumerico} VES`);
        return { usd: valorNumerico };

    } catch (error) {
        console.error('❌ Error en el sync de tasas:', error.message);
        return null;
    }
}
// Exportamos la función limpia para consumirla desde el router de Express
module.exports = { sincronizarTasasOficiales };
