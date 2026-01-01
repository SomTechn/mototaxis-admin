let map, drawnItems;
let currentLayer = null;

async function init() {
    try {
        await esperarSupabase();
        initMap();
        cargarZonasExistentes();
    } catch (e) {
        alert("Error: " + e.message);
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
    // Coordenadas Honduras
    map = L.map('mapAdmin').setView([15.50, -88.00], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

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

    if (!nombre || !currentLayer) return alert("Faltan datos o dibujo");

    // 1. Obtener la geometría pura del dibujo
    const geojson = currentLayer.toGeoJSON();
    const geometry = geojson.geometry; 

    try {
        // 2. Enviar a la función SQL 'guardar_zona_final'
        const { error } = await window.supabaseClient.rpc('guardar_zona_final', {
            p_nombre: nombre,
            p_comision: parseFloat(comision),
            p_base: parseFloat(base),
            p_geometry: geometry 
        });

        if (error) throw error;

        alert("✅ Zona guardada correctamente");
        drawnItems.clearLayers();
        currentLayer = null;
        document.getElementById('zoneName').value = "";
        cargarZonasExistentes();

    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
    }
}

async function cargarZonasExistentes() {
    const { data, error } = await window.supabaseClient.from('puntos').select('id, nombre, tarifa_base, area').eq('activo', true);
    if (error) return;

    const lista = document.getElementById('zonesList');
    lista.innerHTML = "";

    data.forEach(zona => {
        lista.innerHTML += `
            <div class="zone-item">
                <div><strong>${zona.nombre}</strong> (Base: L ${zona.tarifa_base})</div>
                <button onclick="borrarZona('${zona.id}')" style="color:red;border:none;cursor:pointer">🗑️</button>
            </div>`;
        
        if (zona.area) {
            L.geoJSON(zona.area, { style: { color: '#2563eb', fillOpacity: 0.1 } }).bindPopup(zona.nombre).addTo(map);
        }
    });
}

async function borrarZona(id) {
    if(confirm("¿Borrar?")) {
        await window.supabaseClient.from('puntos').delete().eq('id', id);
        map.eachLayer(l => { if(l instanceof L.Path && l!==drawnItems) map.removeLayer(l); });
        cargarZonasExistentes();
    }
}

// Helpers navegación
window.showSection = function(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById('sec-'+id).style.display = 'block';
    if(id === 'zonas') setTimeout(() => map.invalidateSize(), 200);
}

window.addEventListener('load', init);
