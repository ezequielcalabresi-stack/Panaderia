const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');

// Inicializar Express para recibir los mensajes (Webhooks)
const app = express();
app.use(bodyParser.json());

// Conexión segura a tu base de datos de Firebase Realtime Database
// (Para producción, se descarga una clave privada desde tu consola de Firebase)
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://panaderia-sync-281a5-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Ruta Webhook para escuchar los mensajes entrantes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const mensajeEntrante = req.body; // Estructura típica de WhatsApp Cloud API
    // Aquí extraeríamos el texto del mensaje y el número de teléfono del remitente
    // Ejemplo de texto recibido: "saldo Juan Perez" o "pagado Juan Perez"
    
    // RESPUESTA DE EJEMPLO: Procesar consulta de saldo
    if (textoMensaje.toLowerCase().startsWith('saldo')) {
      const nombreBuscado = textoMensaje.replace('saldo', '').trim();
      const saldo = await calcularSaldoDesdeFirebase(nombreBuscado);
      
      // Enviar respuesta por WhatsApp
      await enviarMensajeWhatsApp(telefonoRemitente, `El saldo actual de ${nombreBuscado} es: $${saldo}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error procesando mensaje:", error);
    res.sendStatus(500);
  }
});

// Función auxiliar para buscar el cliente y calcular su saldo directamente de Firebase
async function calcularSaldoDesdeFirebase(nombreCliente) {
  const clientesRef = db.ref('db_clientes');
  const snapshotClientes = await clientesRef.once('value');
  const clientes = snapshotClientes.val() || {};
  
  let clienteId = null;
  Object.keys(clientes).forEach(id => {
    if (clientes[id].nombre.toLowerCase().includes(nombreCliente.toLowerCase())) {
      clienteId = id;
    }
  });

  if (!clienteId) return "Cliente no encontrado";

  // Calcular deuda sumando repartos pendientes e historial
  let saldo = 0;
  const repartosRef = db.ref('db_repartos');
  const snapRepartos = await repartosRef.once('value');
  const repartos = snapRepartos.val() || {};

  Object.values(repartos).forEach(pDia => {
    Object.values(pDia).forEach(p => {
      if (p.clienteId === clienteId && !p.pagado) {
        saldo += p.monto;
      }
    });
  });

  return saldo;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot corriendo en el puerto ${PORT}`);
});