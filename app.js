let map, drawnItems;
let currentLayer = null; // Almacena el polígono actual dibujado

async function init() {
    await esperarSupabase();
    initMap();
    cargarZonasExistentes();
}

async function esperarSupabase() {
    return new Promise(resolve => {
        const i = setInterval(() => {
            if (window.supabaseClient) { clearInterval(i); resolve(); }
        }, 100);
    });
}

function initMap() {
    // Centrado en Honduras (Choloma aprox)
    map = L.map('mapAdmin').setView([15.613, -87.962], 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Configuración de herramientas de dibujo
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        draw: {
            polygon: true,    // Permitir polígonos (Colonias)
            polyline: false, 
            rectangle: false, // Las colonias no son cuadradas perfectas
            circle: false,
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    map.addControl(drawControl);

    // Evento: Cuando se termina de dibujar
    map.on(L.Draw.Event.CREATED, function (e) {
        // Si ya hay una capa, la borramos (solo permitimos crear 1 a la vez por formulario)
        drawnItems.clearLayers();
        
        currentLayer = e.layer;
        drawnItems.addLayer(currentLayer);
        
        console.log("Polígono creado. Listo para guardar.");
    });
}

async function guardarZona() {
    const nombre = document.getElementById('zoneName').value;
    const comision = document.getElementById('zoneFee').value;
    const base = document.getElementById('zoneBase').value;

    if (!nombre || !comision || !base) return alert("Llena todos los campos");
    if (!currentLayer) return alert("Debes dibujar el área en el mapa");

    // Convertir el dibujo a GeoJSON para Supabase
    const geojson = currentLayer.toGeoJSON();
    
    // Preparar el objeto Geometry para PostGIS
    // Supabase espera el formato GeoJSON dentro de la consulta
    const geometry = {
        type: "Polygon",
        coordinates: geojson.geometry.coordinates
    };

    try {
        const { data, error } = await window.supabaseClient
            .from('puntos')
            .insert({
                nombre: nombre,
                comision_valor: parseFloat(comision),
                tarifa_base: parseFloat(base),
                // ST_GeomFromGeoJSON es función de SQL, pero Supabase JS client
                // maneja GeoJSON standard si la columna es GEOGRAPHY
                area: geometry 
            });

        if (error) throw error;

        alert("✅ Zona guardada correctamente");
        drawnItems.clearLayers();
        currentLayer = null;
        document.getElementById('zoneName').value = "";
        cargarZonasExistentes();

    } catch (e) {
        console.error(e);
        alert("Error al guardar: " + e.message + "\n(Asegúrate de haber ejecutado el script SQL de PostGIS)");
    }
}

async function cargarZonasExistentes() {
    const { data, error } = await window.supabaseClient
        .from('puntos')
        .select('id, nombre, comision_valor, tarifa_base, area'); // 'area' vendrá como GeoJSON

    if (error) return console.error(error);

    const lista = document.getElementById('zonesList');
    lista.innerHTML = "";

    data.forEach(zona => {
        // Agregar a la lista visual
        const item = document.createElement('div');
        item.className = 'zone-item';
        item.innerHTML = `
            <div>
                <strong>${zona.nombre}</strong><br>
                <small>Comisión: ${zona.comision_valor}% | Base: L.${zona.tarifa_base}</small>
            </div>
            <div>
                <span class="badge">Activo</span>
                <button onclick="borrarZona('${zona.id}')" style="color:red;border:none;background:none;cursor:pointer">🗑️</button>
            </div>
        `;
        lista.appendChild(item);

        // Dibujar en el mapa (Solo visualización, color gris)
        if (zona.area) {
            L.geoJSON(zona.area, {
                style: { color: '#6b7280', fillOpacity: 0.1 }
            }).bindPopup(`<b>${zona.nombre}</b>`).addTo(map);
        }
    });
}

async function borrarZona(id) {
    if(!confirm("¿Borrar esta zona? Esto afectará a los conductores asignados.")) return;
    await window.supabaseClient.from('puntos').delete().eq('id', id);
    // Recargar mapa limpiando todo
    map.eachLayer((layer) => {
        if (!!layer.toGeoJSON) { map.removeLayer(layer); }
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    map.addLayer(drawnItems);
    cargarZonasExistentes();
}

// Navegación simple
window.showSection = function(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('sec-'+id).style.display = 'block';
    event.currentTarget.classList.add('active');
    if(id === 'zonas') setTimeout(() => map.invalidateSize(), 100); // Fix mapa gris
}

window.addEventListener('load', init);
