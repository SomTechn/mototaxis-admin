// ==========================================
// ADMIN PANEL - GESTIÓN DE ZONAS (FINAL FIX)
// ==========================================

let map, drawnItems;
let currentLayer = null;

async function init() {
    try {
        await esperarSupabase();
        initMap();
        cargarZonasExistentes();
        console.log("Admin panel listo");
    } catch (e) {
        alert("Error iniciando: " + e.message);
    }
}

async function esperarSupabase() {
    return new Promise((resolve) => {
        const i = setInterval(() => {
            if (window.supabaseClient) { clearInterval(i); resolve(); }
        }, 100);
    });
}

function initMap() {
    map = L.map('mapAdmin').setView([15.50, -88.00], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        draw: { polygon: true, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false },
        edit: { featureGroup: drawnItems, remove: true }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers();
        currentLayer = e.layer;
        drawnItems.addLayer(currentLayer);
    });
}

async function guardarZona() {
    const nombre = document.getElementById('zoneName').value;
    const comision = document.getElementById('zoneFee').value;
    const base = document.getElementById('zoneBase').value;

    if (!nombre || !comision || !base) return alert("Llena todos los campos");
    if (!currentLayer) return alert("Dibuja la zona primero");

    // --- MAGIA AQUÍ: EXTRAER SOLO COORDENADAS LIMPIAS ---
    // Leaflet devuelve objetos {lat:..., lng:...}, PostGIS quiere arrays [lng, lat]
    const latlngs = currentLayer.getLatLngs()[0]; // Obtenemos vértices
    
    // Convertir a formato [lng, lat] (Ojo: GeoJSON es Longitud primero)
    let coordenadas = latlngs.map(p => [p.lng, p.lat]);
    
    // CERRAR EL POLÍGONO (El primer punto debe ser igual al último)
    // Si no lo cerramos nosotros, PostGIS dará error.
    const primero = coordenadas[0];
    const ultimo = coordenadas[coordenadas.length - 1];
    if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
        coordenadas.push(primero);
    }

    console.log("Enviando coordenadas:", JSON.stringify(coordenadas));

    try {
        // Llamar a la nueva función simplificada
        const { error } = await window.supabaseClient.rpc('crear_zona_simple', {
            p_nombre: nombre,
            p_comision: parseFloat(comision),
            p_base: parseFloat(base),
            p_coordenadas: coordenadas
        });

        if (error) throw error;

        alert("✅ Zona guardada correctamente");
        
        // Limpiar
        drawnItems.clearLayers();
        currentLayer = null;
        document.getElementById('zoneName').value = "";
        
        // Recargar lista
        cargarZonasExistentes();

    } catch (e) {
        console.error(e);
        alert("Error al guardar: " + e.message + "\n(Revisa consola y SQL)");
    }
}

async function cargarZonasExistentes() {
    const { data, error } = await window.supabaseClient.from('puntos').select('id, nombre, comision_valor, tarifa_base, area').eq('activo', true);
    if (error) return console.error(error);

    const lista = document.getElementById('zonesList');
    lista.innerHTML = "";

    data.forEach(zona => {
        const item = document.createElement('div');
        item.className = 'zone-item';
        item.innerHTML = `<div><strong>${zona.nombre}</strong><br><small>Base: L ${zona.tarifa_base}</small></div><button onclick="borrarZona('${zona.id}')" style="color:red;border:none;background:none;cursor:pointer">🗑️</button>`;
        lista.appendChild(item);

        if (zona.area) {
            L.geoJSON(zona.area, { style: { color: '#555', weight: 2, fillOpacity: 0.1 } }).bindPopup(zona.nombre).addTo(map);
        }
    });
}

async function borrarZona(id) {
    if(!confirm("¿Borrar?")) return;
    await window.supabaseClient.from('puntos').delete().eq('id', id);
    // Limpiar mapa visual
    map.eachLayer((layer) => { if (layer instanceof L.Path && layer !== drawnItems) { map.removeLayer(layer); } });
    cargarZonasExistentes();
}

window.showSection = function(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById('sec-'+id).style.display = 'block';
    if(id === 'zonas') setTimeout(() => map.invalidateSize(), 200);
}

window.addEventListener('load', init);
