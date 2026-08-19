// socketIO.js

// Recibimos 'io' desde el index.js para evitar la importación circular
module.exports = function(io) {

    io.on('connection', function(socket) {
        console.log('🔌 Un cliente se ha conectado al WebSocket');

        socket.on('message', (msg) => {
            console.log('Mensaje recibido: ' + msg);
            socket.broadcast.emit('message', msg);
        });

        socket.on('disconnect', function() {
            console.log('❌ Usuario desconectado');
        });

        socket.on('save-carrito', function(data) {
            io.emit('new-carrito', data);
        });

        socket.on('save-carrito_dos', function(data) {
            io.emit('new-carrito_dos', data);
        });

        socket.on('save-mensaje', function(data) {
            io.emit('new-mensaje', data);
        });

        socket.on('save-formmsm', function(data) {
            io.emit('new-formmsm', data);
        });

        socket.on('save-stock', function(data) {
            io.emit('new-stock', data);
        });

        socket.on('save-notification', function(data) {
            io.emit('new-notification', data);
        });

        socket.on('stock-update', function(data) {
            io.emit('new-notification', data);
        });
    });
};
