// ==========================================
// ADMIN PANEL - GESTIÓN DE ZONAS (FIXED)
// ==========================================

let map, drawnItems;
let currentLayer = null;

// 1. INICIALIZACIÓN
async function init() {
    try {
        await esperarSupabase();
        initMap();
        cargarZonasExistentes();
        console.log("Sistema Admin listo");
    } catch (e) {
        alert("Error iniciando: " + e.message);
    }
}

// Esperar a que config.js cargue la librería de Supabase
async function esperarSupabase() {
    return new Promise((resolve) => {
        const i = setInterval(() => {
            if (window.supabaseClient) { clearInterval(i); resolve(); }
        }, 100);
    });
}

// 2. CONFIGURACIÓN DEL MAPA
function initMap() {
    // Coordenadas centrales (Honduras aprox)
    map = L.map('mapAdmin').setView([15.50, -88.00], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Capa para dibujar
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Controles de dibujo (Solo polígonos)
    const drawControl = new L.Control.Draw({
        draw: {
            polygon: true,
            polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    map.addControl(drawControl);

    // Evento al terminar de dibujar
    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers(); // Borrar anteriores (solo 1 a la vez)
        currentLayer = e.layer;
        drawnItems.addLayer(currentLayer);
    });
}

// 3. GUARDAR ZONA (LA CORRECCIÓN ESTÁ AQUÍ)
async function guardarZona() {
    const nombre = document.getElementById('zoneName').value;
    const comision = document.getElementById('zoneFee').value;
    const base = document.getElementById('zoneBase').value;

    if (!nombre || !comision || !base) return alert("Llena todos los campos de texto");
    if (!currentLayer) return alert("Dibuja el área en el mapa primero");

    // Convertir dibujo a formato JSON
    const geojson = currentLayer.toGeoJSON();
    const geometry = geojson.geometry;

    try {
        // LLAMADA SEGURA A LA BASE DE DATOS (RPC)
        const { error } = await window.supabaseClient.rpc('crear_zona', {
            p_nombre: nombre,
            p_comision: parseFloat(comision),
            p_base: parseFloat(base),
            p_geojson: geometry
        });

        if (error) throw error;

        alert("✅ Zona guardada correctamente");
        
        // Limpiar formulario
        drawnItems.clearLayers();
        currentLayer = null;
        document.getElementById('zoneName').value = "";
        
        // Actualizar lista
        cargarZonasExistentes();

    } catch (e) {
        console.error(e);
        alert("Error al guardar: " + e.message + "\n(Verifica haber corrido el SQL 'crear_zona' en Supabase)");
    }
}

// 4. CARGAR LISTA DE ZONAS
async function cargarZonasExistentes() {
    const { data, error } = await window.supabaseClient
        .from('puntos')
        .select('id, nombre, comision_valor, tarifa_base, area')
        .eq('activo', true);

    if (error) return console.error(error);

    const lista = document.getElementById('zonesList');
    lista.innerHTML = "";

    data.forEach(zona => {
        // Agregar a la lista HTML
        const item = document.createElement('div');
        item.className = 'zone-item';
        item.innerHTML = `
            <div>
                <strong>${zona.nombre}</strong><br>
                <small>Base: L ${zona.tarifa_base} | Com: ${zona.comision_valor}%</small>
            </div>
            <button onclick="borrarZona('${zona.id}')" style="color:red;border:none;background:none;cursor:pointer">🗑️</button>
        `;
        lista.appendChild(item);

        // Dibujar en el mapa (Gris claro)
        if (zona.area) {
            L.geoJSON(zona.area, {
                style: { color: '#555', weight: 2, fillOpacity: 0.1 }
            }).bindPopup(zona.nombre).addTo(map);
        }
    });
}

// 5. BORRAR ZONA
async function borrarZona(id) {
    if(!confirm("¿Borrar esta zona?")) return;
    await window.supabaseClient.from('puntos').delete().eq('id', id);
    
    // Limpiar mapa visualmente
    map.eachLayer((layer) => {
        if (layer instanceof L.Path && layer !== drawnItems) {
            map.removeLayer(layer);
        }
    });
    cargarZonasExistentes();
}

// Navegación de pestañas
window.showSection = function(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('sec-'+id).style.display = 'block';
    event.currentTarget.classList.add('active');
    if(id === 'zonas') setTimeout(() => map.invalidateSize(), 200);
}

window.addEventListener('load', init);
