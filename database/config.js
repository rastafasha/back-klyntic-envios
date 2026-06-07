const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

// Enable buffering to handle connection timing in serverless
mongoose.set('bufferCommands', true);

const dbConnection = async () => {
    // Check if DB_MONGO is defined
    if (!process.env.DB_MONGO) {
        console.warn('ADVERTENCIA: DB_MONGO no está definida en las variables de entorno');
        return;
    }

    // Check if already connected
    if (mongoose.connection.readyState === 1) {
        console.log('DB ya conectada (cacheada)');
        return;
    }

    // Check if connecting
    if (mongoose.connection.readyState === 2) {
        console.log('DB ya en proceso de conexión, esperando...');
        // Wait for the existing connection attempt
        await new Promise((resolve, reject) => {
            mongoose.connection.once('open', resolve);
            mongoose.connection.once('error', reject);
        });
        return;
    }

    try {
        console.log('Conectando a MongoDB...');
        
        await mongoose.connect(process.env.DB_MONGO, {
            serverSelectionTimeoutMS: 10000, // Timeout after 10s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
            maxPoolSize: 10, // Maintain up to 10 socket connections
            minPoolSize: 1,
        });
        
        console.log('✅ DB MongoDB Online');
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('Error de conexión MongoDB:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB desconectado');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconectado');
        });
        
    } catch (error) {
        console.error('❌ Error al conectar con MongoDB:', error.message);
        throw error; // Re-throw so the caller knows connection failed
    }
};

module.exports = {
    dbConnection
};

