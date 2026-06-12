function doGet(e) {
  return ContentService.createTextOutput("Servidor Turnos Pro activo.");
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let response = {};

    if (data.action === "SAVE") {
      // 1. Guardar copia técnica (JSON)
      let sheetDB = ss.getSheetByName("_DB_SYSTEM_");
      if (!sheetDB) { sheetDB = ss.insertSheet("_DB_SYSTEM_"); sheetDB.hideSheet(); }
      sheetDB.getRange("A1").setValue(JSON.stringify(data.payload));

      // 2. Generar pestañas visuales
      const profiles = data.payload.profiles;
      profiles.forEach(p => {
        actualizarPestanaPerfil(ss, p);
        actualizarPestanaVacaciones(ss, p);
      });
      generarResumenVacaciones(ss, profiles);

      response = { status: "success", msg: "Guardado y actualizado visualmente" };
    }
    else if (data.action === "LOAD") {
      const sheetDB = ss.getSheetByName("_DB_SYSTEM_");
      if (!sheetDB) throw new Error("No hay base de datos");
      const json = sheetDB.getRange("A1").getValue();
      response = { status: "success", data: JSON.parse(json) };
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", msg: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function actualizarPestanaPerfil(ss, perfil) {
  let hoja = ss.getSheetByName(perfil.name);
  if (!hoja) {
    hoja = ss.insertSheet(perfil.name);
    hoja.setFrozenRows(1);
  }

  // Encabezados actualizados con columna VACACIONES
  hoja.getRange("A1:G1").setValues([["FECHA", "DÍA", "TIPO", "TURNO", "NOTA", "COLOR", "VACACIONES"]])
    .setFontWeight("bold").setBackground("#4338ca").setFontColor("white");

  // Mapa de turnos para acceso rápido
  const turnosMap = {};
  perfil.shifts.forEach(t => turnosMap[t.id] = t);

  const vacDays = perfil.vacationDays || {};

  // Unificar fechas incluyendo días de vacaciones
  const fechas = new Set([
    ...Object.keys(perfil.assignedShifts),
    ...Object.keys(perfil.notes),
    ...Object.keys(vacDays)
  ]);
  const listaFechas = Array.from(fechas).sort();

  const filas = [];
  const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  listaFechas.forEach(fecha => {
    const turnoId = perfil.assignedShifts[fecha];
    const turno = turnosMap[turnoId];
    const nota = perfil.notes[fecha] || "";
    const vacType = vacDays[fecha] || "";
    const vacLabel = vacType === 'v15' ? '15 Hábiles' : (vacType === 'v6' ? '6 Adicionales' : '');
    const dateObj = new Date(fecha);

    if (turno || nota || vacType) {
      let tipo = "Libre/Nota";
      if (vacType) tipo = "Vacaciones";
      else if (turno) tipo = "Trabajo";

      filas.push([
        fecha,
        diasSemana[dateObj.getDay()],
        tipo,
        turno ? turno.name : "-",
        nota,
        turno ? turno.color : (vacType === 'v15' ? '#f59e0b' : (vacType === 'v6' ? '#8b5cf6' : '#ffffff')),
        vacLabel
      ]);
    }
  });

  // Limpiar y escribir
  const lastRow = hoja.getLastRow();
  if (lastRow > 1) hoja.getRange(2, 1, lastRow, 7).clearContent();
  if (filas.length > 0) {
    hoja.getRange(2, 1, filas.length, 7).setValues(filas);
    const rangeColores = hoja.getRange(2, 6, filas.length, 1);
    rangeColores.setBackgrounds(filas.map(f => [f[5]]));
    rangeColores.setFontColor("#ffffff");
    for (let i = 0; i < filas.length; i++) {
      if (filas[i][6]) {
        const color = filas[i][6] === '15 Hábiles' ? '#fef3c7' : '#ede9fe';
        hoja.getRange(i + 2, 7).setBackground(color);
      }
    }
  }
}

// Pestaña individual de vacaciones por persona
function actualizarPestanaVacaciones(ss, perfil) {
  const nombreHoja = perfil.name + " - Vacaciones";
  let hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja);
    hoja.setFrozenRows(1);
  }

  hoja.getRange("A1:E1").setValues([["TIPO", "DÍAS", "FECHA INICIO", "FECHA REGRESO", "DÍAS MARCADOS"]])
    .setFontWeight("bold").setBackground("#d97706").setFontColor("white");

  const records = perfil.vacationRecords || [];
  const lastRow = hoja.getLastRow();
  if (lastRow > 1) hoja.getRange(2, 1, lastRow, 5).clearContent();
  if (records.length === 0) return;

  const filas = records.map(r => [
    r.typeName,
    r.type === 'v15' ? 15 : 6,
    r.startDate,
    r.returnDate,
    (r.days || []).join(", ")
  ]);

  hoja.getRange(2, 1, filas.length, 5).setValues(filas);
  for (let i = 0; i < filas.length; i++) {
    const color = records[i].type === 'v15' ? '#fef3c7' : '#ede9fe';
    hoja.getRange(i + 2, 1, 1, 5).setBackground(color);
  }
}

// Pestaña resumen global de todos los perfiles
function generarResumenVacaciones(ss, profiles) {
  const nombreHoja = "Resumen Vacaciones";
  let hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja);
    hoja.setFrozenRows(1);
  }

  hoja.getRange("A1:F1").setValues([["PERSONA", "TIPO", "DÍAS", "FECHA INICIO", "FECHA REGRESO", "CALCULADO"]])
    .setFontWeight("bold").setBackground("#7c3aed").setFontColor("white");

  const filas = [];
  profiles.forEach(perfil => {
    (perfil.vacationRecords || []).forEach(r => {
      filas.push([
        perfil.name,
        r.typeName,
        r.type === 'v15' ? 15 : 6,
        r.startDate,
        r.returnDate,
        new Date().toLocaleDateString('es-CL')
      ]);
    });
  });

  const lastRow = hoja.getLastRow();
  if (lastRow > 1) hoja.getRange(2, 1, lastRow, 6).clearContent();
  if (filas.length > 0) {
    hoja.getRange(2, 1, filas.length, 6).setValues(filas);
    for (let i = 0; i < filas.length; i++) {
      hoja.getRange(i + 2, 1, 1, 6).setBackground(i % 2 === 0 ? '#f5f3ff' : '#ffffff');
    }
  }
}
