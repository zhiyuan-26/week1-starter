// Replace addMarkersToMap with clustered version
// Store cities data and markers
console.log('map.js loaded');
let citiesData = [];
let markers = {};
let cityCount = 0;
let map = null;

let proximityMode = null;
let searchMarker = null;
let radiusCircle = null;
let proximityLayer;
let radiusLayer;
let heatLayer = null;

// Initial Dublin coordinates
const DUBLIN_COORDS = [53.3498, -6.2603]
const DEFAULT_ZOOM = 6

// API endpoint
const API_URL = '/api/cities/';

// Initialize the map
async function initMap() {
    // Initialize Leaflet map centered on Dublin
    map = L.map('map').setView(DUBLIN_COORDS, DEFAULT_ZOOM);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        minZoom: 2
    }).addTo(map);

    setupProximitySearch(map);

    showLoading(true);
    try {
        // Fetch cities from API
        console.log('Fetching from:', API_URL);
        const response = await fetch(API_URL);
        // console.log('Response status:', response.status);
        // console.log('Response headers:', response.headers);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response body:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Data received:', data);
        citiesData = data.results || data;
        cityCount = citiesData.length;

        // Update city count
        document.getElementById('cityCount').textContent = cityCount;

        // Add markers to map
        addMarkersToMap(citiesData);
        addHeatmapLayer(citiesData);

    } catch (error) {
        console.error('Error fetching cities:', error);
        showProximityStatus(`Error loading cities: ${error.message}`, true);
        // console.error('Error details:', {
        //     message: error.message,
        //     stack: error.stack,
        //     name: error.name
        // });
        alert('Failed to load cities data. ${error.message}');
    } finally {
        showLoading(false);
    }
}

// Add markers for each city
function addMarkersToMap(cities) {
    // Clear existing markers
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {};

    cities.forEach(city => {
        const lat = parseFloat(city.latitude);
        const lng = parseFloat(city.longitude);

        if (isNaN(lat) || isNaN(lng)) {
            console.warn(`Invalid coordinates for ${city.name}`);
            return;
        }

        // Create marker
        const marker = L.circleMarker([lat, lng], {
            radius: 6,
            fillColor: '#007bff',
            color: '#0056b3',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);

        // Add popup with city information
        const popupContent = createPopupContent(city);
        marker.bindPopup(popupContent);

        // When creating each marker from a city in the API response:
        marker.on('click', () => {
            if (proximityMode) runProximitySearch(city);
        });

        // Store reference
        markers[city.id] = marker;
    });
}

// Create HTML content for popup
function createPopupContent(city) {
    const lat = city.latitude ?? city.coordinates?.lat;
    const lng = city.longitude ?? city.coordinates?.lng;

    return `
        <div class="city-popup">
            <h3>${city.name}</h3>
            <p><strong>Country:</strong> ${city.country}</p>
            ${city.region ? `<p><strong>Region:</strong> ${city.region}</p>` : ''}
            <p><strong>Population:</strong> ${formatNumber(city.population)}</p>
            <p><strong>Coordinates:</strong> ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}</p>
            ${city.founded_year ? `<p><strong>Founded:</strong> ${city.founded_year}</p>` : ''}
            ${city.timezone ? `<p><strong>Timezone:</strong> ${city.timezone}</p>` : ''}
        </div>
    `;
}

// Format numbers with thousands separator
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Search functionality
function setupSearchListener() {
    document.getElementById('searchInput').addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase();
        const resultsDiv = document.getElementById('results');

        if (query.length === 0) {
            resultsDiv.innerHTML = '';
            addMarkersToMap(citiesData);
            return;
        }

        // Filter cities
        const filtered = citiesData.filter(city => 
            city.name.toLowerCase().includes(query) ||
            city.country.toLowerCase().includes(query)
        );

        // Display results
        if (filtered.length === 0) {
            resultsDiv.innerHTML = '<p style="color: #999;">No cities found</p>';
            // Clear markers
            Object.values(markers).forEach(marker => map.removeLayer(marker));
            markers = {};
        } else {
            // Show matching markers only
            Object.values(markers).forEach(marker => map.removeLayer(marker));
            markers = {};
            addMarkersToMap(filtered);

            // Update results list
            resultsDiv.innerHTML = filtered.map(city => `
                <div style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;" onclick="goToCity(${city.id})">
                    <strong>${city.name}</strong>, ${city.country}
                </div>
            `).join('');
        }
    });
}

// Navigate to city on map when clicked in search results panel
function goToCity(cityId, lat, lng) {
    let targetLat = lat;
    let targetLng = lng;

    if (!targetLat || !targetLng) {
        const city = citiesData.find(c => c.id === cityId);
        if (city) {
            targetLat = city.latitude;
            targetLng = city.longitude;
        }
    }
    
    if (targetLat && targetLng) {
        map.setView([targetLng, targetLng], 10, { animate: true });
        if (markers[cityId]) {
            markers[cityId].openPopup();
        }
    }
}

// Reset map view
function setupResetListener() {
    document.getElementById('resetBtn').addEventListener('click', function() {

        // Return to Dublin view without animation
        map.setView(DUBLIN_COORDS, DEFAULT_ZOOM, { animate: false });

        // Clear ordinary search input and results
        document.getElementById('searchInput').value = '';
        document.getElementById('results').innerHTML = '';

        // Reset proximity mode controls
        proximityMode = null;
        document.getElementById('radius-control').classList.add('d-none');
        map.getContainer().style.cursor = '';
        showProximityStatus('Choose a search mode, then click a city marker.');

        addMarkersToMap(citiesData);
        clearProximityResults(map);
    });
}

// Initialize map on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing map...');
    initMap();
    setupSearchListener();
    setupResetListener();
});

function setupProximitySearch(map) {
    proximityLayer = L.layerGroup().addTo(map);
    radiusLayer = L.layerGroup().addTo(map);

    document.getElementById('nearest-search-btn').addEventListener('click', () => {
        setProximityMode(map, 'nearest');
    });
    document.getElementById('radius-search-btn').addEventListener('click', () => {
        setProximityMode(map, 'radius');
    });
}

function setProximityMode(map, mode) {
    proximityMode = proximityMode === mode ? null : mode;

    const radiusControl = document.getElementById('radius-control');
    if (radiusControl) radiusControl.classList.toggle('d-none', proximityMode !== 'radius');        

    map.getContainer().style.cursor = proximityMode ? 'crosshair' : '';

    if (proximityMode) {
        showProximityStatus(`Mode set: ${proximityMode === 'nearest' ? '10 Nearest' : 'Radius Search'}. Click any city marker on the map.`);
    } else {
        showProximityStatus('Search mode deactivated.');
    }
    clearProximityResults(map);
}

// Numbered Marker Generator for Top 10 Nearest
function createNumberedIcon(number) {
    const svgIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">
            <path d="M15 0 C6.7 0 0 6.7 0 15 C0 26.2 15 42 15 42 C15 42 30 26.2 30 15 C30 6.7 23.3 0 15 0 Z" fill="#fd7e14" stroke="#d9480f" stroke-width="2"/>
            <circle cx="15" cy="15" r="10" fill="#ffffff"/>
            <text x="15" y="19" font-size="12" font-weight="bold" text-anchor="middle" fill="#d9480f">${number}</text>
        </svg>
    `;
    return L.divIcon({
        className: 'custom-numbered-marker',
        html: svgIcon,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -38]
    });
}

async function runProximitySearch(city) {
    if (!proximityMode) return;
    // These coordinates come from the selected city's existing API record.
    const lat = Number(city.latitude);
    const lng = Number(city.longitude);
    const radiusInput = document.getElementById('radius-input');
    const radiusKm = radiusInput ? Number(radiusInput.value) : 100;
    const isRadiusSearch = proximityMode === 'radius';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        showProximityStatus(`${city.name} has invalid coordinates in the API response.`, true)
        return;
    }
    if (isRadiusSearch && (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 20000)) {
        showProximityStatus('Enter a radius greater than 0 and no more than 20000 km.', true);
        return;
    }

    showProximityStatus('Searching database...');
    clearProximityResults(map);

    try {
        const response = await fetch(
            isRadiusSearch ? '/api/cities/radius/' : '/api/cities/nearest/',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isRadiusSearch
                    ? { lat, lng, radius_km: radiusKm }
                    : { lat, lng })
            }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Search failed (${response.status})`);

        searchMarker = L.marker([lat, lng], {
            title: `Origin: ${city.name}`
        }).addTo(map).bindPopup(`<strong>Search Origin:</strong> ${city.name}`);

        const cities = isRadiusSearch ? data.cities : data.nearest_cities;
        const heading = isRadiusSearch
            ? `${data.total_found} cities within ${data.radius_km} km of ${city.name}`
            : `10 nearest cities to ${city.name}`;

        showProximityResults(cities, heading);
        updateHeatmapForResults(cities, isRadiusSearch ? 'radius' : 'nearest');

        if (isRadiusSearch) {
            map.setView([lat, lng], Math.max(map.getZoom(), 6), { animate: false });
            
            // Add radius overlay circle (radius in meters)
            radiusCircle = L.circle([lat, lng], {
                radius: radiusKm * 1000,
                color: '#198754',
                fillOpacity: 0.08
            }).addTo(map);

            cities.forEach((city) => {
                const cMarker = L.circleMarker([city.coordinates.lat, city.coordinates.lng], {
                    radius: 7,
                    fillColor: '#198754',
                    color: '#0f5132',
                    weight: 2,
                    fillOpacity: 0.9
                }).bindPopup(createPopupContent(city));

                cMarker.on('click', () => goToCity(city.id, city.coordinates.lat, city.coordinates.lng));
                radiusLayer.addLayer(cMarker);
            });

            map.fitBounds(radiusCircle.getBounds(), {
                padding: [30, 30],
                animate: false
            });
            map.setView([lat, lng], map.getZoom(), { animate: false });
        } else {
            cities.forEach((city, index) => {
                const rankNumber = city.rank || index + 1;
                const nMarker = L.marker([city.coordinates.lat, city.coordinates.lng], {
                    icon: createNumberedIcon(rankNumber)
                }).bindPopup(`<strong>#${rankNumber} ${city.name}</strong><br>Distance: ${city.distance_km} km`);

                nMarker.on('click', () => goToCity(city.id, city.coordinates.lat, city.coordinates.lng));
                proximityLayer.addLayer(nMarker);
            });
               
            if (cities.length > 0) {
                const group = L.featureGroup([searchMarker, ...proximityLayer.getLayers()]);
                map.fitBounds(group.getBounds(), { padding: [40, 40], animate: true });
            }
        }

        showProximityStatus(`Found ${cities.length} results for ${city.name}`);

    } catch (error) {
        console.error('Proximity Search Error:', error);
        showProximityStatus(`Error: ${error.message}`, true);
    }
}

function showProximityResults(cities, heading) {
    const results = document.getElementById('proximity-results');
    if (!results) return;

    results.replaceChildren();
    
    const title = document.createElement('strong');
    title.textContent = heading;
    results.append(title);

    if (!cities || cities.length === 0) {
        const noResult = document.createElement('p');
        noResult.textContent = 'No matching cities found in range.';
        results.append(noResult);
        return;
    }

    const list = document.createElement('ol');
    cities.forEach((city) => {
        const item = document.createElement('li');
        item.textContent = `${city.name}, ${city.country} — ${city.distance_km} km`;

        item.addEventListener('mouseover', () => { item.style.textDecoration = 'underline'; });
        item.addEventListener('mouseout', () => { item.style.textDecoration = 'none'; });

        // Click on a result zooms to its city marker
        item.addEventListener('click', () => {
            goToCity(city.id, city.coordinates?.lat, city.coordinates?.lng);
        });
        
        list.append(item);
    });
    results.append(list);
}

function updateHeatmapForResults(cities, mode) {
    const heatData = cities
        .map(city => [city.coordinates.lat, city.coordinates.lng, 1])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    replaceHeatmap(heatData, mode);
}

function addHeatmapLayer(cities) {
    const heatData = cities.map(city => [
        parseFloat(city.latitude),
        parseFloat(city.longitude),
        0.8  // Intensity
    ]);

    L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 1,
        minOpacity: 0.2
    }).addTo(map);
}

function replaceHeatmap(heatData, mode) {
    if (heatLayer) map.removeLayer(heatLayer);
    const gradients = {
        default: { 0.2: '#0000ff', 0.5: '#00ffff', 0.75: '#ffff00', 1: '#ff0000' },
        nearest: { 0.2: '#00ffff', 0.5: '#00ff00', 0.75: '#ffff00', 1: '#ff7f00' },
        radius: { 0.2: '#00ff00', 0.5: '#ffff00', 0.75: '#ff7f00', 1: '#ff0000' }
    };
    heatLayer = L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 10,
        minOpacity: 0.2,
        gradient: gradients[mode]
    }).addTo(map);
}

function clearProximityResults(map) {
    if (searchMarker) map.removeLayer(searchMarker);
    if (radiusCircle) map.removeLayer(radiusCircle);
    searchMarker = radiusCircle = null;
    proximityLayer?.clearLayers();
    radiusLayer?.clearLayers();

    // Remove search marker, result layers, and radius circle.
    // Restore the heatmap using all cities from the API response.
    const proxResults = document.getElementById('proximity-results');
    if (proxResults) proxResults.replaceChildren();

    const allCityHeat = citiesData
        .map(city => [city.latitude, city.longitude, 0.8])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    replaceHeatmap(allCityHeat, 'default');
}

function showProximityStatus(message, isError = false) {
    const status = document.getElementById('proximity-status');
    if (status) {
        status.textContent = message;
        status.style.color = isError ? '#dc3545' : '#495057';
        status.style.fontWeight = isError ? 'bold' : 'normal';
    }
}

// Loading Spinner Overlay
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initialising map...');
    initMap();
    setupSearchListener();
    setupResetListener();
});