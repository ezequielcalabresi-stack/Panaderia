// Matriz de permisos reflejada de tu aplicación web
const MATRIZ_PERMISOS = {
  admin: [
    'consultar_saldo', 'registrar_pago', 'ver_direccion', 'cargar_pedido', 
    'marcar_pagado', 'ver_cuadra', 'ajustar_remanente', 'consultar_deuda_proveedor',
    'cargar_factura', 'ver_stock', 'consumir_stock', 'ver_caja', 'cerrar_turno',
    'modificar_precio', 'gestionar_usuarios', 'forzar_backup'
  ],
  mostrador: [
    'consultar_saldo', 'registrar_pago', 'ver_direccion', 'cargar_pedido', 
    'marcar_pagado', 'ver_cuadra', 'consultar_deuda_proveedor',
    'ver_stock', 'consumir_stock', 'ver_caja', 'cerrar_turno'
    // ❌ Sin permiso para modificar precios ni gestionar usuarios
  ],
  repartidor: [
    'ver_direccion', 'marcar_pagado', 'consultar_saldo'
    // ❌ Acceso exclusivo para la calle y logística
  ],
  produccion: [
    'ver_cuadra', 'ajustar_remanente', 'ver_stock', 'consumir_stock'
    // ❌ Sin acceso a cajas ni cuentas corrientes
  ]
};

// Función para identificar al usuario y validar su permiso
async function validarPermisoUsuario(db, numeroWhatsApp, accionRequerida) {
  try {
    // 1. Buscar en Firebase el usuario que tenga este número de teléfono registrado
    const usuariosRef = db.ref('db_usuarios');
    const snapshot = await usuariosRef.once('value');
    const usuarios = snapshot.val() || {};

    let usuarioEncontrado = null;
    Object.values(usuarios).forEach(u => {
      // Normalizamos el teléfono para comparar sin guiones ni espacios
      if (u.telefono && u.telefono.replace(/\D/g, '') === numeroWhatsApp.replace(/\D/g, '')) {
        usuarioEncontrado = u;
      }
    });

    if (!usuarioEncontrado) {
      return { autorizado: false, mensaje: "⛔ No estás autorizado para usar este asistente. Tu número no figura en el sistema." };
    }

    // 2. Verificar si el rol del usuario tiene asignada la acción
    const rol = usuarioEncontrado.rol || 'repartidor';
    const permisosDelRol = MATRIZ_PERMISOS[rol] || [];

    if (!permisosDelRol.includes(accionRequerida)) {
      return { 
        autorizado: false, 
        mensaje: `⚠️ Acción denegada. Tu rol de *${rol}* no tiene permisos para ejecutar esta función.` 
      };
    }

    return { autorizado: true, usuario: usuarioEncontrado };

  } catch (error) {
    console.error("Error en validación de permisos:", error);
    return { autorizado: false, mensaje: "❌ Ocurrió un error al verificar tu identidad." };
  }
}

module.exports = { validarPermisoUsuario };