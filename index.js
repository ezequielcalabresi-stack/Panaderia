const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Configurar servidor Express para que Render no tire error de puerto
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot de la panadería activo por Código QR 🚀');
});

app.listen(PORT, () => {
    console.log(`Servidor web corriendo en el puerto ${PORT}`);
});

// Inicializar el cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth() // Guarda la sesión para no tener que escanear el QR cada vez que se reinicie
});

client.on('qr', (qr) => {
    // Genera el código QR en la consola de Render para que lo escanees
    console.log('Escanea este código QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('¡El bot está listo y conectado a WhatsApp!');
});

// Escuchar los mensajes que te llegan
client.on('message', async msg => {
    const texto = msg.body.toLowerCase();

    console.log(`Mensaje recibido de ${msg.from}: ${texto}`);

    // Lógica simple de respuestas de la panadería
    if (texto.includes('saldo')) {
        await msg.reply('Hola! Tu saldo actual es de $0 (Sistema de prueba conectado por QR).');
    } else if (texto.includes('hola')) {
        await msg.reply('¡Hola! Bienvenido a la panadería. Escribí "saldo" para consultar tus datos.');
    }
});

// Iniciar el cliente
client.initialize();
