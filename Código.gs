const SPREADSHEET_ID = '1O1X0wdjAUjHCTKBEp85TnGHc5hNZ9i682LdJvsUw-No'; // ID de tu Google Sheet

// Sirve la aplicación web principal.
function doGet() {
  const html = HtmlService.createTemplateFromFile('Index');
  const output = html.evaluate();
  return output.setTitle("Ceci Conecta")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(fileName) {
  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}

/**
 * Obtiene los datos de los tableros y las secciones para el módulo principal.
 * @returns {Object} Un objeto con las listas de secciones y la estructura de tableros.
 */
function getPortalData() {
  const data = {
    secciones: _getSeccionesUnicas(),
    tableros: _getTablerosFiltrados()
  };
  return data;
}

/**
 * Lee la hoja "Conocimiento" y devuelve una lista de recursos.
 * @returns {Array<Object>} Un array de objetos, donde cada objeto es un recurso.
 */
function getKnowledgeData() {
  try {
    const sheetName = 'Conocimiento';
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
    if (!sheet) {
      Logger.log(`ERROR: La hoja "${sheetName}" no fue encontrada.`);
      return []; // Devuelve un array vacío si la hoja no existe
    }

    // Empezamos en la fila 2 para saltar los encabezados. Leemos 5 columnas.
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues(); 
    
    const recursos = [];
    for (let i = 0; i < data.length; i++) {
      const fila = data[i];
      if (!fila[0]) continue; // Si el título está vacío, saltamos esa fila.

      const recurso = {
        titulo: fila[0],
        descripcion: fila[1],
        tipo: fila[2],
        urlEmbed: fila[3],
        categoria: fila[4]
      };
      recursos.push(recurso);
    }
    
    Logger.log(`${recursos.length} recursos encontrados en el Centro de Conocimiento.`);
    return recursos;

  } catch (e) {
    Logger.log(`Error en getKnowledgeData: ${e.message}`);
    return [];
  }
}

/**
 * Lee la hoja "PQRS_Casos" y devuelve una lista de items, filtrada por el dominio del usuario.
 * Asume la estructura de columnas de la imagen proporcionada.
 * @returns {Array<Object>} Un array de objetos, donde cada objeto es un item PQRS.
 */
function getPqrsCasesByDomain() {
  try {
    const userDomain = _getUserDomain();
    if (!userDomain) {
      Logger.log("ERROR: No se pudo obtener el dominio del usuario para PQRS.");
      return [];
    }

    const sheetName = 'PQRS_Casos'; // ¡¡¡Asegúrate de que este sea el nombre EXACTO de tu hoja!!!
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
    if (!sheet) {
      Logger.log(`ERROR: La hoja "${sheetName}" no fue encontrada.`);
      return [];
    }

    // getRange(filaInicial, columnaInicial, numeroFilas, numeroColumnas)
    // Empezamos en la fila 2 (después de los encabezados), columna 1 (A)
    // Leemos hasta la última fila con datos, y un total de 12 columnas (A a L)
    // Si necesitas leer M (Tiempo parametrizado), el último parámetro debe ser 13.
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues(); 
    
    const pqrsCases = [];
    for (let i = 0; i < data.length; i++) {
      const fila = data[i]; // 'fila' es un array que representa una fila de tu hoja

      // Extraer el dominio de la "Persona encargada" (Columna L, índice 11)
      const personaEncargadaEmail = String(fila[11] || '').trim();
      let caseDomain = '';
      if (personaEncargadaEmail.includes('@')) {
          caseDomain = personaEncargadaEmail.split('@')[1].split('.')[0].toLowerCase();
      }

      // Validamos si 'ID' (columna D, índice 3) está vacío,
      // o si el 'dominio de la Persona Encargada' no coincide con el dominio del usuario.
      if (!fila[3] || caseDomain !== userDomain.toLowerCase()) {
        continue; // Si no hay ID o el dominio no coincide, saltamos la fila.
      }

      const caseItem = {
        criticidad: fila[0] || 'N/A',   // Columna A
        tipoDeCaso: fila[1] || 'N/A',   // Columna B
        fechaGeneracion: fila[2] ? new Date(fila[2]).toLocaleDateString() : 'N/A', // Columna C
        id: fila[3],                    // Columna D (Tu ID de caso)
        caso: fila[4] || 'N/A',         // Columna E (Tu 'Resumen alerta' anterior)
        detalleCaso: fila[5] || 'Sin detalle', // Columna F (Tu 'Tiempos gestión' anterior, ahora es 'detalle')
        negocio: fila[6] || 'N/A',      // Columna G
        respuestaCECI: fila[7] || 'N/A',// Columna H
        fechaCierre: fila[8] ? new Date(fila[8]).toLocaleDateString() : 'N/A',   // Columna I
        estado: fila[9] || 'N/A',       // Columna J
        tiempo: fila[10] || 'N/A',      // Columna K (Tu 'Total días' anterior)
        personaEncargada: fila[11] || 'N/A', // Columna L (¡Usada para filtrar por dominio!)
        // 'Tiempo parametrizado' (Columna M, índice 12) no está incluido en este objeto si solo leemos hasta L
        // Si necesitas el Link Detalle, deberías añadir una columna a tu hoja y actualizar el rango.
        linkDetalle: '#' // Placeholder si no tienes una columna para Link Detalle
      };
      pqrsCases.push(caseItem);
    }
    
    Logger.log(`${pqrsCases.length} casos PQRS encontrados para el dominio ${userDomain}.`);
    return pqrsCases;

  } catch (e) {
    Logger.log(`Error en getPqrsCasesByDomain: ${e.message}`);
    return [];
  }
}

/**
 * Añade un nuevo caso PQRS a la hoja "PQRS_Casos".
 * @param {Object} formData Un objeto con los datos del formulario del nuevo caso.
 * @returns {Object} Un objeto con el estado de la operación (ej. {success: true, message: "Caso guardado"}).
 */
function addPqrsCase(formData) {
  try {
    const sheetName = 'PQRS_Casos'; // ¡¡¡Asegúrate de que sea el nombre exacto de tu hoja!!!
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
    if (!sheet) {
      return { success: false, message: `Error: La hoja "${sheetName}" no fue encontrada.` };
    }

    // Obtener el dominio del usuario actual para el campo "Persona encargada" si es un email
    const userEmail = Session.getActiveUser().getEmail();
    const userDomain = userEmail.split('@')[1] ? userEmail.split('@')[1].split('.')[0] : 'desconocido';

    // Generar un ID simple para el caso (puedes mejorar esta lógica si necesitas IDs únicos complejos)
    // Busca el último ID y súmale 1. Asumiendo ID está en columna D (índice 3)
    let newId = 1000; 
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) { 
      const idRange = sheet.getRange(2, 4, lastRow - 1, 1); // Rango de IDs existentes
      const ids = idRange.getValues().flat().filter(id => typeof id === 'number');
      if (ids.length > 0) {
        newId = Math.max(...ids) + 1;
      }
    }
    
    // Preparar la fila para añadir, mapeando los datos del formData a tus columnas
    // El orden de las columnas debe COINCIDIR con tu hoja 'PQRS_Casos'
    // Tu hoja: A=Criticidad, B=Tipo de caso, C=Fecha generación, D=ID, E=Caso, F=Detalle caso, G=Negocio, H=Respuesta CECI, I=Fecha cierre, J=Estado, K=Tiempo, L=Persona encargada, M=Tiempo parametrizado
    const newRow = [
      formData.criticidad || '',           // Columna A: Criticidad
      formData.tipoAlerta || '',           // Columna B: Tipo de caso (tipo de alerta)
      new Date().toLocaleDateString('es-CO'), // Columna C: Fecha generación (automática)
      newId,                               // Columna D: ID (generado automáticamente)
      formData.resumenAlerta || '',        // Columna E: Caso (resumen de alerta)
      formData.detalleAlarma || '',        // Columna F: Detalle caso (detalle de alarma)
      formData.negocio || '',              // Columna G: Negocio (si se recolecta del formulario)
      '',                                  // Columna H: Respuesta CECI (vacío inicialmente)
      '',                                  // Columna I: Fecha cierre (vacío inicialmente)
      formData.estado || 'Abierto',        // Columna J: Estado (por defecto 'Abierto' si no se especifica)
      '',                                  // Columna K: Tiempo (vacío inicialmente)
      userEmail,                           // Columna L: Persona encargada (email del usuario actual)
      ''                                   // Columna M: Tiempo parametrizado (vacío inicialmente)
      // Agrega más campos si tu hoja tiene más columnas y quieres que se llenen
    ];

    sheet.appendRow(newRow); // Añade la nueva fila a la hoja

    return { success: true, message: `Caso PQRS #${newId} guardado con éxito.` };

  } catch (e) {
    Logger.log(`Error al añadir caso PQRS: ${e.message}`);
    return { success: false, message: `Error al guardar el caso: ${e.message}` };
  }
}


// --- Funciones de Ayuda Internas ---

function _getUserDomain() {
  try {
    const email = Session.getActiveUser().getEmail();
    const domainPart = email.split('@')[1];
    return domainPart.split('.')[0]; // Retorna solo la primera parte del dominio (ej. "google" de "google.com")
  } catch (e) {
    Logger.log(`Error al obtener el dominio del usuario: ${e.message}`);
    return null;
  }
}

function _getTablerosFiltrados() {
  const userDomain = _getUserDomain();
  if (!userDomain) return {};

  const sheetName = 'Tableros';
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const estructura = {};

  for (let i = 1; i < data.length; i++) {
    const [seccion, negocio, tipo, nombre, url, descripcion, dominioPlanilla] = data[i];

    if (userDomain === String(dominioPlanilla).trim().toLowerCase()) { // Convertir a minúsculas para comparar
      if (!seccion || !negocio || !tipo || !nombre || !url) continue;

      if (!estructura[seccion]) estructura[seccion] = {};
      if (!estructura[seccion][negocio]) {
        estructura[seccion][negocio] = {
          descripcion: String(descripcion || 'Sin descripción.').trim()
        };
      }
      estructura[seccion][negocio][tipo] = {
        nombre: String(nombre).trim(),
        url: String(url).trim()
      };
    }
  }
  return estructura;
}

function _getSeccionesUnicas() {
  const sheetName = 'Procesos';
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) return [];

  const values = sheet.getRange('A2:A').getValues();
  const seccionesSet = new Set();

  for (let i = 0; i < values.length; i++) {
    const seccion = values[i][0] ? String(values[i][0]).trim() : '';
    if (seccion) {
      seccionesSet.add(seccion);
    }
  }
  return Array.from(seccionesSet);
}