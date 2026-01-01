let map, drawnItems;
let currentLayer = null;


async function init() {
    try {
        await esperarSupabase();
        initMap();
        cargarZonasExistentes();
        console.log("✅ Admin JS Cargado - Versión RPC");
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

    if (!nombre || !currentLayer) return alert("Faltan datos");

    // 1. Obtener Geometría
    const geojson = currentLayer.toGeoJSON();
    const geometry = geojson.geometry;

    // 2. TRUCO DE SEGURIDAD: Cerrar el polígono manualmente
    // PostGIS exige que el primer y último punto sean idénticos
    const coords = geometry.coordinates[0];
    const primero = coords[0];
    const ultimo = coords[coords.length - 1];
    
    // Si no son iguales, agregamos el primero al final
    if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
        geometry.coordinates[0].push(primero);
    }

    try {
        console.log("Enviando RPC..."); // Debug
        
        // 3. USAR RPC (No .insert directo)
        const { error } = await window.supabaseClient.rpc('crear_zona_rpc', {
            nombre_zona: nombre,
            comision: parseFloat(comision),
            base: parseFloat(base),
            geometria: geometry
        });

        if (error) {
            console.error("Error SQL:", error);
            throw error;
        }

        alert("✅ Zona guardada correctamente");
        drawnItems.clearLayers();
        currentLayer = null;
        document.getElementById('zoneName').value = "";
        cargarZonasExistentes();

    } catch (e) {
        alert("Error: " + e.message + "\n(Mira la consola para más detalles)");
    }
}

async function cargarZonasExistentes() {
    // Select simple para ver si guardó
    const { data, error } = await window.supabaseClient.from('puntos').select('*').eq('activo', true);
    if (error) return;

    const lista = document.getElementById('zonesList');
    lista.innerHTML = "";

    data.forEach(zona => {
        lista.innerHTML += `
            <div class="zone-item">
                <strong>${zona.nombre}</strong> (L ${zona.tarifa_base})
                <button onclick="borrarZona('${zona.id}')" style="color:red;border:none;cursor:pointer">🗑️</button>
            </div>`;
        // Pintar mapa
        if (zona.area) {
            L.geoJSON(zona.area).addTo(map);
        }
    });
}

async function borrarZona(id) {
    if(!confirm("¿Borrar?")) return;
    await window.supabaseClient.from('puntos').delete().eq('id', id);
    window.location.reload(); 
}

// Navegación
window.showSection = function(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById('sec-'+id).style.display = 'block';
    if(id === 'zonas') setTimeout(() => map.invalidateSize(), 200);
}

window.addEventListener('load', init);
