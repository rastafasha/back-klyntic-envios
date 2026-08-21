const { Router } = require('express');
const router = Router();
const { sincronizarTasasOficiales } = require('../services/cron-tasas.service');

// =========================================================================
// ⏰ 1. ENDPOINT AUTOMÁTICO PARA CRON-JOB.ORG (Método GET Obligatorio)
// =========================================================================
router.get('/tasks/sync-tasa-bcv', async (req, res) => {
    try {
        console.log('⏰ [CRON-JOB.ORG] Petición externa recibida. Liberando conexión inmediatamente...');
        
        // 🎯 1. RESPUESTA INMEDIATA: Evita el Timeout de 30 segundos en cron-job.org
        res.status(202).json({ 
            ok: true, 
            msg: 'Petición aceptada. Sincronizando la tasa en segundo plano...' 
        });

        // 🎯 2. PROCESAMIENTO EN SEGUNDO PLANO (Post-respuesta)
        // Ejecutamos de forma asíncrona sin bloquear la respuesta HTTP
        sincronizarTasasOficiales()
            .then((tasa) => {
                if (tasa) {
                    console.log(`✅ Tasa sincronizada con éxito en segundo plano: ${tasa}`);
                    // Notificamos a Angular por Sockets en tiempo real
                    if (global.io) {
                        global.io.emit('tasa-bcv-actualizada', { tasa });
                    }
                } else {
                    console.error('❌ Fallo en la sincronización automática: No se obtuvo tasa.');
                }
            })
            .catch(syncErr => {
                console.error('❌ Error crítico ejecutando la sincronización en segundo plano:', syncErr.message);
            });

    } catch (error) {
        console.error('❌ Error crítico en la ruta del cronjob:', error.message);
        if (!res.headersSent) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    }
});


// =========================================================================
// 🎛️ 2. ENDPOINT MANUAL PARA EL PANEL ADMINISTRATIVO (Método POST)
// =========================================================================
router.post('/forzar-actualizacion-tasa', async (req, res) => {
    try {
        console.log('🎛️ [PANEL] Ejecutando sincronización manual de tasa solicitada por el usuario...');

        // 🎯 1. PROMESAS CON TIEMPO LÍMITE (Evita que la pantalla del médico se congele indefinidamente)
        // Si en 25 segundos el BCV no responde, se cancela para no colgar el servidor
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con el servidor cambiario')), 25000)
        );

        // Corremos la sincronización y el temporizador en carrera
        const tasa = await Promise.race([
            sincronizarTasasOficiales(),
            timeoutPromise
        ]);

        // 🎯 2. VERIFICACIÓN DE SEGURIDAD EXPLICITA
        // Evaluamos explícitamente que no sea null, undefined o un string vacío
        if (tasa !== null && tasa !== undefined && tasa !== '') {
            
            // Notificamos por Sockets en tiempo real a todas las pantallas abiertas de Angular
            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { tasa });
                console.log(`📡 [SOCKET] Nueva tasa emitida globalmente: ${tasa}`);
            }
            
            return res.json({ 
                ok: true, 
                msg: 'Tasa oficial actualizada con éxito desde el panel administrativo.', 
                tasa 
            });

        } else {
            return res.status(400).json({ 
                ok: false, 
                msg: 'El portal cambiario respondió correctamente pero devolvió un formato de tasa inválido.' 
            });
        }

    } catch (error) {
        console.error('❌ Error crítico en forzar-actualizacion-tasa:', error.message);
        
        // Manejo amigable si el error fue por lentitud del BCV
        if (error.message.includes('Tiempo de espera')) {
            return res.status(504).json({ ok: false, msg: error.message });
        }

        return res.status(500).json({ ok: false, error: error.message });
    }
});


module.exports = router;
