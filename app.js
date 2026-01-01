let map, drawnItems;
let currentLayer = null;

async function init() {
    try {
        await esperarSupabase();
        initMap();
        cargarZonasExistentes();
        console.log("Admin panel listo");
    } catch (e) {
        console.error(e);
        alert("Error iniciando: " + e.message);
    }
}

async function esperarSupabase() {
    return new Promise((resolve, reject) => {
        let intentos = 0;
        const i = setInterval(() => {
            intentos++;
            if (window.supabaseClient) { 
                clearInterval(i); 
                resolve(); 
            } else if (intentos > 50) {
                clearInterval(i);
                reject(new Error("No se pudo conectar a Supabase"));
            }
        }, 100);
    });
}

function initMap() {
    // Coordenadas aproximadas de Honduras
    map = L.map('mapAdmin').setView([15.50, -88.00], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        draw: {
            polygon: true,
            polyline: false,
            rectangle: false,
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

    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers(); // Solo permitimos una zona a la vez por guardado
        currentLayer = e.layer;
        drawnItems.addLayer(currentLayer);
        console.log("Zona dibujada lista para guardar");
    });
}

async function guardarZona() {
    const nombre = document.getElementById('zoneName').value;
    const comision = document.getElementById('zoneFee').value;
    const base = document.getElementById('zoneBase').value;

    if (!nombre || !comision || !base) return alert("Por favor llena nombre, comisión y tarifa base.");
    if (!currentLayer) return alert("Debes dibujar el polígono en el mapa primero.");

    // OBTENER GEOMETRÍA DIRECTA
    // Convertimos la capa de Leaflet a GeoJSON
    const geojson = currentLayer.toGeoJSON();
    
    // Extraemos solo la parte de geometría para la BD
    const geometry = geojson.geometry;

    console.log("Enviando a Supabase:", geometry); // Para depuración

    try {
        const { data, error } = await window.supabaseClient
            .from('puntos')
            .insert({
                nombre: nombre,
                comision_valor: parseFloat(comision),
                tarifa_base: parseFloat(base),
                area: geometry // Enviamos el objeto directo
            });

        if (error) throw error;

        alert("✅ Zona guardada correctamente");
        
        // Limpiar formulario
        drawnItems.clearLayers();
        currentLayer = null;
        document.getElementById('zoneName').value = "";
        
        // Recargar lista
        cargarZonasExistentes();

    } catch (e) {
        console.error("Error completo:", e);
        alert("Error al guardar: " + e.message + " (Revisa la consola para más detalles)");
    }
}

async function cargarZonasExistentes() {
    const { data, error } = await window.supabaseClient
        .from('puntos')
        .select('id, nombre, comision_valor, tarifa_base, area')
        .eq('activo', true);

    if (error) {
        console.error("Error cargando zonas:", error);
        return;
    }

    const lista = document.getElementById('zonesList');
    lista.innerHTML = "";

    data.forEach(zona => {
        const div = document.createElement('div');
        div.className = 'zone-item';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px">
                <strong>${zona.nombre}</strong>
                <button onclick="borrarZona('${zona.id}')" style="color:red; cursor:pointer; border:none; background:none">Eliminar</button>
            </div>
            <div style="font-size:0.8rem; color:#666">
                Base: L ${zona.tarifa_base} | Comisión: ${zona.comision_valor}%
            </div>
        `;
        lista.appendChild(div);

        // Dibujar en el mapa (visualización)
        if (zona.area) {
            L.geoJSON(zona.area, {
                style: { color: '#2563eb', weight: 2, fillOpacity: 0.1 }
            }).bindPopup(zona.nombre).addTo(map);
        }
    });
}

async function borrarZona(id) {
    if(!confirm("¿Seguro que quieres borrar esta zona?")) return;
    
    try {
        const { error } = await window.supabaseClient
            .from('puntos')
            .delete()
            .eq('id', id);
            
        if(error) throw error;
        
        // Limpiar mapa y recargar
        map.eachLayer((layer) => {
            if (layer instanceof L.Path && layer !== drawnItems) {
                map.removeLayer(layer);
            }
        });
        cargarZonasExistentes();
        
    } catch(e) {
        alert("Error al borrar: " + e.message);
    }
}

// Funciones de navegación
window.showSection = function(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById('sec-'+id).style.display = 'block';
    
    // Fix para que el mapa cargue bien si estaba oculto
    if(id === 'zonas' && map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

window.addEventListener('load', init);
