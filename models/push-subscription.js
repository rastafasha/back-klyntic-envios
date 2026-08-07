const mongoose = require('mongoose');

const PushSubscriptionSchema = new mongoose.Schema({
    // Aquí se guarda el ID numérico o UUID que viene desde MySQL/Laravel
    usuario: { 
        type: String, 
        required: true 
    }, 
    // Los datos puros del navegador/celular que exige la Web Push API
    subscription: {
        endpoint: { type: String, required: true },
        expirationTime: { type: Number, default: null },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, { collection: 'klyntic_push_subscriptions' }); // Forzamos su propia colección médica en Mongo

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
