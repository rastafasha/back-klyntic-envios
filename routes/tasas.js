const { Router } = require('express');
const router = Router();
const { sincronizarTasasOficiales } = require('../services/cron-tasas.service');

// =========================================================================
// ⏰ 1. ENDPOINT AUTOMÁTICO PARA CRON-JOB.ORG (Método GET Obligatorio)
// =========================================================================
router.get('/tasks/sync-tasa-bcv', async (req, res) => {
    try {
        console.log('⏰ [CRON-JOB.ORG] Petición externa recibida. Iniciando sincronización...');
        
        // 🎯 1. ESPERA REAL EN EL CONTENEDOR: Render mantendrá el proceso vivo mientras esto se ejecute
        const tasa = await sincronizarTasasOficiales();
        
        // Validación estricta de la tasa obtenida
        const tasaNumerica = parseFloat(tasa);

        if (!isNaN(tasaNumerica) && tasaNumerica > 0) {
            console.log(`✅ Tasa sincronizada con éxito: ${tasaNumerica}`);
            
            // Notificamos a Angular por Sockets en tiempo real
            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { tasa: tasaNumerica });
            }

            // 🎯 2. RESPUESTA SUCESS: Solo respondemos cuando de verdad se guardó en la BD
            return res.status(200).json({ 
                ok: true, 
                msg: 'Sincronización completada con éxito',
                tasa: tasaNumerica
            });

        } else {
            console.error('❌ Fallo en la sincronización automática: Formato numérico inválido.');
            return res.status(422).json({ ok: false, msg: 'Formato numérico inválido' });
        }

    } catch (error) {
        // Captura cualquier error de scraping, de red del BCV o de guardado en base de datos
        console.error('❌ Error crítico en la ejecución del cronjob:', error.message);
        
        if (!res.headersSent) {
            return res.status(500).json({ 
                ok: false, 
                msg: 'Error interno al procesar la tasa', 
                error: error.message 
            });
        }
    }
});



// =========================================================================
// 🎛️ 2. ENDPOINT MANUAL PARA EL PANEL ADMINISTRATIVO (Método POST)
// =========================================================================
router.post('/forzar-actualizacion-tasa', async (req, res) => {
    // 🎯 1. DECLARAMOS LA VARIABLE DEL TEMPORIZADOR FUERA PARA PODER LIMPIARLA
    let timeoutId = null;

    try {
        console.log('🎛️ [PANEL] Ejecutando sincronización manual de tasa solicitada por el usuario...');

        // Promesa con tiempo límite
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('Tiempo de espera agotado al conectar con el servidor cambiario'));
            }, 25000);
        });

        // Corremos la sincronización y el temporizador en carrera
        const tasa = await Promise.race([
            sincronizarTasasOficiales(),
            timeoutPromise
        ]);

        // 🎯 2. LIMPIEZA INMEDIATA DE MEMORIA (Se cancela el reloj si el BCV respondió a tiempo)
        if (timeoutId) clearTimeout(timeoutId);

        // 🎯 3. VALIDACIÓN MATEMÁTICA ESTRICTA (Evita NaN, strings vacíos o ceros)
        const tasaNumerica = parseFloat(tasa);

        if (!isNaN(tasaNumerica) && tasaNumerica > 0) {
            
            // Notificamos por Sockets en tiempo real a todas las pantallas abiertas de Angular
            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { tasa: tasaNumerica });
                console.log(`📡 [SOCKET] Nueva tasa emitida globalmente: ${tasaNumerica}`);
            }
            
            return res.json({ 
                ok: true, 
                msg: 'Tasa oficial actualizada con éxito desde el panel administrativo.', 
                tasa: tasaNumerica 
            });

        } else {
            return res.status(400).json({ 
                ok: false, 
                msg: 'El portal cambiario respondió correctamente pero devolvió un formato de tasa inválido.' 
            });
        }

    } catch (error) {
        // 🎯 4. SEGURIDAD EN EL CATCH: Si la promesa dio timeout, también limpiamos el ID por si acaso
        if (timeoutId) clearTimeout(timeoutId);

        console.error('❌ Error crítico en forzar-actualizacion-tasa:', error.message);
        
        // Manejo amigable si el error fue por lentitud del BCV
        if (error.message.includes('Tiempo de espera')) {
            return res.status(504).json({ ok: false, msg: error.message });
        }

        return res.status(500).json({ ok: false, error: error.message });
    }
});



module.exports = router;
