document.addEventListener('DOMContentLoaded', () => {
    // API Endpoints
    const API_URL_GEMPA_DIRASAKAN = 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json';
    const API_URL_GEMPA_TERKINI = 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json';
    const API_URL_AUTOGEMPA = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';

    const loadingEl = document.getElementById('loading');
    let currentMapInstance = null;
    let currentQuakeData = null;
    let miniMapInstance = null;
    let allQuakesData = [];
    let currentTip = 0;
    let emergencyInterval = null;
    let tipsInterval = null;

    // ==========================================
    // THEME MANAGEMENT
    // ==========================================
    const themeToggle = document.getElementById('theme-toggle');
    const thIco = document.getElementById('themeIcon');
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            thIco.innerHTML = "<i class='fas fa-moon'></i>";
        } else {
            document.documentElement.removeAttribute('data-theme');
            thIco.innerHTML = "<i class='fas fa-sun'></i>";
        }
        
        if (currentMapInstance && document.getElementById('map')) {
            updateMapTileLayer(theme);
        }
        if (miniMapInstance && document.getElementById('mini-map')) {
            updateMiniMapTileLayer(theme);
        }
    };

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) applyTheme(savedTheme);

    themeToggle?.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        if (navigator.vibrate) navigator.vibrate(10);
    });

    // ==========================================
    // TOAST NOTIFICATION
    // ==========================================
    function showToast(message, icon = 'check-circle') {
        const toast = document.getElementById('ios-toast');
        const toastMessage = document.getElementById('toast-message');
        const toastIcon = toast.querySelector('i');
        
        toastMessage.textContent = message;
        toastIcon.className = `fas fa-${icon}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    // ==========================================
    // LIVE ACTIVITY
    // ==========================================
    function showLiveActivity(quake) {
        const activity = document.getElementById('live-activity');
        if (!activity) return;
        
        document.getElementById('live-mag').textContent = quake.Magnitude + ' M';
        document.getElementById('live-loc').textContent = quake.Wilayah;
        document.getElementById('live-time').textContent = 'Baru saja';
        
        activity.style.display = 'block';
        
        setTimeout(() => {
            activity.style.transform = 'translateX(50%) translateY(-100px)';
            setTimeout(() => {
                activity.style.display = 'none';
                activity.style.transform = '';
            }, 600);
        }, 10000);
    }

    // ==========================================
    // COLLAPSIBLE SECTIONS
    // ==========================================
    function setupCollapsibles() {
        const headers = document.querySelectorAll('.ios-section-header');
        
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const targetId = header.dataset.target;
                const content = document.getElementById(targetId);
                const chevron = header.querySelector('.ios-chevron');
                
                document.querySelectorAll('.ios-collapsible.active').forEach(openContent => {
                    if (openContent.id !== targetId) {
                        openContent.classList.remove('active');
                        const correspondingHeader = document.querySelector(`[data-target="${openContent.id}"]`);
                        correspondingHeader?.querySelector('.ios-chevron')?.classList.remove('active');
                    }
                });
                
                content.classList.toggle('active');
                chevron.classList.toggle('active');
                
                if (navigator.vibrate) navigator.vibrate(5);
            });
        });
    }

    // ==========================================
    // MAP TILES UPDATE
    // ==========================================
    function updateMapTileLayer(theme) {
        if (!currentMapInstance) return;
        
        const isDark = theme === 'dark';
        const tileUrl = isDark 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        
        currentMapInstance.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                currentMapInstance.removeLayer(layer);
            }
        });
        
        L.tileLayer(tileUrl, {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(currentMapInstance);
    }

    function updateMiniMapTileLayer(theme) {
        if (!miniMapInstance) return;
        
        const isDark = theme === 'dark';
        const tileUrl = isDark 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        
        miniMapInstance.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                miniMapInstance.removeLayer(layer);
            }
        });
        
        L.tileLayer(tileUrl, {
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(miniMapInstance);
    }

    // ==========================================
    // STATS CALCULATION
    // ==========================================
    function updateStats(allQuakes) {
        if (!allQuakes || allQuakes.length === 0) return;
        
        const now = new Date();
        const last24h = allQuakes.filter(q => {
            const quakeTime = new Date(q.DateTime);
            return (now - quakeTime) < 24 * 60 * 60 * 1000;
        });
        
        const total = last24h.length || allQuakes.length;
        const magnitudes = allQuakes.map(q => parseFloat(q.Magnitude));
        const maxMag = Math.max(...magnitudes);
        const avgMag = (magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length).toFixed(1);
        
        const regions = {};
        allQuakes.forEach(q => {
            const region = detectRegion(q.Wilayah);
            regions[region] = (regions[region] || 0) + 1;
        });
        const mostActiveRegion = Object.entries(regions)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
        
        animateNumber('stat-total', total);
        animateNumber('stat-max', maxMag.toFixed(1));
        document.getElementById('stat-region').textContent = mostActiveRegion;
        animateNumber('stat-avg', avgMag);
    }

    function detectRegion(wilayah) {
        const w = wilayah.toLowerCase();
        if (w.includes('sumatera') || w.includes('aceh') || w.includes('padang') || w.includes('medan') || w.includes('bengkulu')) return 'Sumatera';
        if (w.includes('jawa') || w.includes('jakarta') || w.includes('bandung') || w.includes('yogyakarta') || w.includes('surabaya') || w.includes('semarang')) return 'Jawa';
        if (w.includes('kalimantan') || w.includes('borneo')) return 'Kalimantan';
        if (w.includes('sulawesi') || w.includes('makassar') || w.includes('manado') || w.includes('palu')) return 'Sulawesi';
        if (w.includes('bali') || w.includes('lombok') || w.includes('ntt') || w.includes('ntb') || w.includes('kupang')) return 'Bali & NT';
        if (w.includes('papua') || w.includes('maluku') || w.includes('ambon') || w.includes('jayapura')) return 'Papua & Maluku';
        return 'Lainnya';
    }

    function animateNumber(id, target) {
        const el = document.getElementById(id);
        if (!el) return;
        
        const start = 0;
        const duration = 1000;
        const startTime = performance.now();
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const current = start + (target - start) * easeProgress;
            
            el.textContent = typeof target === 'string' && target.includes('.') 
                ? current.toFixed(1) 
                : Math.floor(current);
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.textContent = target;
            }
        }
        
        requestAnimationFrame(update);
    }

    // ==========================================
    // MINI MAP
    // ==========================================
    function initMiniMap(quakes) {
        const container = document.getElementById('mini-map');
        if (!container) return;
        
        miniMapInstance = L.map('mini-map', {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false
        }).setView([-2.5, 118], 4);
        
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const isDark = currentTheme === 'dark';
        const tileUrl = isDark 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        
        L.tileLayer(tileUrl, {
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(miniMapInstance);
        
        quakes.slice(0, 30).forEach(quake => {
            const [lat, lon] = quake.Coordinates.split(',').map(c => parseFloat(c.trim()));
            const mag = parseFloat(quake.Magnitude);
            const color = mag >= 5 ? '#FF3B30' : mag >= 4 ? '#FF9500' : '#007AFF';
            
            L.circleMarker([lat, lon], {
                radius: Math.max(3, mag),
                fillColor: color,
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(miniMapInstance);
        });
        
        document.getElementById('quake-count-map').textContent = `${quakes.length} gempa`;
    }

    // ==========================================
    // TIPS CAROUSEL
    // ==========================================
    function rotateTips() {
        const tips = document.querySelectorAll('.ios-tip-card');
        const dots = document.querySelectorAll('.dot');
        if (!tips.length) return;
        
        tips[currentTip].classList.remove('active');
        tips[currentTip].classList.add('prev');
        dots[currentTip].classList.remove('active');
        
        currentTip = (currentTip + 1) % tips.length;
        
        tips[currentTip].classList.remove('prev');
        tips[currentTip].classList.add('active');
        dots[currentTip].classList.add('active');
        
        setTimeout(() => {
            tips.forEach((tip, i) => {
                if (i !== currentTip) tip.classList.remove('prev');
            });
        }, 400);
    }

    // ==========================================
    // TIMELINE
    // ==========================================
    function renderTimeline(quakes) {
        const container = document.getElementById('activity-timeline');
        if (!container) return;
        
        const recent = quakes.slice(0, 8);
        
        container.innerHTML = recent.map((quake, i) => {
            const time = new Date(quake.DateTime);
            const now = new Date();
            const diff = Math.floor((now - time) / 60000);
            
            let timeText;
            if (diff < 1) timeText = 'Baru';
            else if (diff < 60) timeText = `${diff}m`;
            else if (diff < 1440) timeText = `${Math.floor(diff/60)}j`;
            else timeText = `${Math.floor(diff/1440)}h`;
            
            const color = parseFloat(quake.Magnitude) >= 5 ? 'var(--ios-red)' : 
                         parseFloat(quake.Magnitude) >= 4 ? 'var(--ios-orange)' : 'var(--ios-accent)';
            
            return `
                <div class="timeline-item" style="animation-delay: ${i * 0.1}s">
                    <div class="timeline-dot" style="background: ${color}; box-shadow: 0 0 0 2px ${color}"></div>
                    <span class="timeline-time">${timeText}</span>
                    <span class="timeline-mag">${quake.Magnitude}</span>
                </div>
            `;
        }).join('');
    }

    // ==========================================
    // FILTER & SEARCH
    // ==========================================
    function setupFilters() {
        const filterBtn = document.getElementById('filter-btn');
        const filterPanel = document.getElementById('filter-panel');
        const magRange = document.getElementById('mag-range');
        const magValue = document.getElementById('mag-value');
        const searchInput = document.getElementById('search-input');
        
        filterBtn?.addEventListener('click', () => {
            const isVisible = filterPanel.style.display !== 'none';
            filterPanel.style.display = isVisible ? 'none' : 'block';
            if (!isVisible && navigator.vibrate) navigator.vibrate(5);
        });
        
        magRange?.addEventListener('input', (e) => {
            magValue.textContent = e.target.value + ' M';
            filterQuakes();
        });
        
        searchInput?.addEventListener('input', filterQuakes);
        
        document.getElementById('region-select')?.addEventListener('change', filterQuakes);
    }

    function filterQuakes() {
        const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
        const minMag = parseFloat(document.getElementById('mag-range')?.value || 0);
        const region = document.getElementById('region-select')?.value || 'all';
        
        const feltList = document.getElementById('felt-quakes-list-container');
        const majorList = document.getElementById('recent-major-quakes-list-container');
        
        const filterData = (quakes) => {
            return quakes.filter(q => {
                const matchSearch = q.Wilayah.toLowerCase().includes(searchTerm);
                const matchMag = parseFloat(q.Magnitude) >= minMag;
                const matchRegion = region === 'all' || detectRegion(q.Wilayah) === region;
                return matchSearch && matchMag && matchRegion;
            });
        };
        
        const feltQuakes = allQuakesData.filter(q => parseFloat(q.Magnitude) < 5);
        const majorQuakes = allQuakesData.filter(q => parseFloat(q.Magnitude) >= 5);
        
        renderQuakeList(filterData(feltQuakes), feltList);
        renderQuakeList(filterData(majorQuakes), majorList);
    }

    // ==========================================
    // EMERGENCY SIMULATION
    // ==========================================
    function setupEmergency() {
        const btn = document.getElementById('emergency-sim-btn');
        if (!btn) return;
        
        btn.addEventListener('click', () => {
            const modal = document.getElementById('emergency-modal');
            modal.style.display = 'flex';
            
            if (navigator.vibrate) {
                navigator.vibrate([500, 200, 500, 200, 1000, 200, 1000]);
            }
            
            playAlertSound();
        });
    }

    window.stopEmergency = function() {
        const modal = document.getElementById('emergency-modal');
        modal.style.display = 'none';
        if (navigator.vibrate) navigator.vibrate(0);
        clearInterval(emergencyInterval);
        emergencyInterval = null;
    };

    function playAlertSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            emergencyInterval = setInterval(() => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = 800;
                oscillator.type = 'square';
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.5);
            }, 700);
        } catch (e) {
            console.log('Audio not supported');
        }
    }

    // ==========================================
    // HELPER FUNCTIONS
    // ==========================================
    function getMagnitudeClass(mag) {
        const magnitude = parseFloat(mag);
        if (magnitude < 4.0) return 'low';
        if (magnitude < 6.0) return 'medium';
        return 'high';
    }

    function getMagnitudeColor(mag) {
        const m = parseFloat(mag);
        if (m < 4) return 'var(--ios-green)';
        if (m < 6) return 'var(--ios-orange)';
        return 'var(--ios-red)';
    }

    // ==========================================
    // RENDER FUNCTIONS
    // ==========================================
    function renderLatestQuakeCard(quake, container) {
        const magnitudeClass = getMagnitudeClass(quake.Magnitude);
        const hasTsunami = quake.Potensi && quake.Potensi.toLowerCase().includes('tsunami');
        
        container.innerHTML = `
            <div class="card-magnitude-large">${quake.Magnitude}</div>
            <div class="card-magnitude-label">Magnitudo</div>
            
            <div class="card-info-grid">
                <div class="card-info-row">
                    <span class="card-info-label">
                        <i class="far fa-calendar"></i> Waktu
                    </span>
                    <span class="card-info-value">${quake.Tanggal}, ${quake.Jam}</span>
                </div>
                <div class="card-info-row">
                    <span class="card-info-label">
                        <i class="fas fa-location-dot"></i> Lokasi
                    </span>
                    <span class="card-info-value">${quake.Wilayah}</span>
                </div>
                <div class="card-info-row">
                    <span class="card-info-label">
                        <i class="fas fa-ruler-vertical"></i> Kedalaman
                    </span>
                    <span class="card-info-value">${quake.Kedalaman}</span>
                </div>
                <div class="card-info-row">
                    <span class="card-info-label">
                        <i class="fas fa-compass"></i> Koordinat
                    </span>
                    <span class="card-info-value">${quake.Coordinates}</span>
                </div>
            </div>
            
            <div class="card-potensi ${hasTsunami ? 'tsunami' : 'no-tsunami'}">
                <i class="fas ${hasTsunami ? 'fa-triangle-exclamation' : 'fa-check'}"></i>
                <span>${quake.Potensi || 'Tidak berpotensi tsunami'}</span>
            </div>
            
            <a href="../pages/info-gempa.html?id=${encodeURIComponent(quake.DateTime)}" class="ios-detail-btn">
                <span>Lihat Detail</span>
                <i class="fas fa-arrow-right"></i>
            </a>
        `;
    }

    function renderQuakeList(quakes, container) {
        container.innerHTML = '';
        container.className = 'ios-list';
        
        if (!quakes || quakes.length === 0) {
            container.innerHTML = '<div class="ios-list-item"><span class="list-item-subtitle">Tidak ada data</span></div>';
            return;
        }
        
        quakes.forEach((quake, index) => {
            const item = document.createElement('a');
            item.className = 'ios-list-item';
            item.href = `../pages/info-gempa.html?id=${encodeURIComponent(quake.DateTime)}`;
            item.style.animationDelay = `${index * 0.05}s`;
            
            const magnitudeClass = getMagnitudeClass(quake.Magnitude);
            
            item.innerHTML = `
                <div class="magnitude-badge ${magnitudeClass}">
                    <span class="magnitude-value">${quake.Magnitude}</span>
                    <span class="magnitude-label">M</span>
                </div>
                <div class="list-item-content">
                    <div class="list-item-title">${quake.Wilayah}</div>
                    <div class="list-item-subtitle">
                        <i class="far fa-clock"></i>
                        ${quake.Tanggal} • ${quake.Jam}
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }

    function renderDetailContent(quake) {
        const container = document.getElementById('quake-detail-container');
        const magnitudeClass = getMagnitudeClass(quake.Magnitude);
        const colorVar = magnitudeClass === 'low' ? 'var(--ios-green)' : 
                        magnitudeClass === 'medium' ? 'var(--ios-orange)' : 'var(--ios-red)';
        
        container.innerHTML = `
            <div class="ios-detail-header">
                <div class="ios-detail-magnitude" style="color: ${colorVar}">${quake.Magnitude} M</div>
                <div class="ios-detail-location">${quake.Wilayah}</div>
            </div>
            
            <div class="ios-detail-grid">
                <div class="ios-detail-item">
                    <div class="ios-detail-icon"><i class="far fa-calendar"></i></div>
                    <span class="ios-detail-label">Tanggal</span>
                    <span class="ios-detail-value">${quake.Tanggal}</span>
                </div>
                <div class="ios-detail-item">
                    <div class="ios-detail-icon"><i class="far fa-clock"></i></div>
                    <span class="ios-detail-label">Waktu</span>
                    <span class="ios-detail-value">${quake.Jam} WIB</span>
                </div>
                <div class="ios-detail-item">
                    <div class="ios-detail-icon"><i class="fas fa-ruler-vertical"></i></div>
                    <span class="ios-detail-label">Kedalaman</span>
                    <span class="ios-detail-value">${quake.Kedalaman}</span>
                </div>
                <div class="ios-detail-item">
                    <div class="ios-detail-icon"><i class="fas fa-compass"></i></div>
                    <span class="ios-detail-label">Koordinat</span>
                    <span class="ios-detail-value">${quake.Coordinates}</span>
                </div>
                <div class="ios-detail-item full-width">
                    <div class="ios-detail-icon"><i class="fas fa-water"></i></div>
                    <span class="ios-detail-label">Potensi Tsunami</span>
                    <span class="ios-detail-value">${quake.Potensi || 'Tidak ada'}</span>
                </div>
            </div>
        `;
        
        const coordsEl = document.getElementById('map-coords');
        if (coordsEl) coordsEl.textContent = quake.Coordinates;
    }

    // ==========================================
    // PAGE INITIALIZATION
    // ==========================================
    async function initIndexPage() {
        setupCollapsibles();
        setupFilters();
        setupEmergency();
        
        // Start tips rotation
        tipsInterval = setInterval(rotateTips, 5000);
        
        // Click on dots to change tip
        document.querySelectorAll('.dot').forEach((dot, index) => {
            dot.addEventListener('click', () => {
                clearInterval(tipsInterval);
                const tips = document.querySelectorAll('.ios-tip-card');
                const dots = document.querySelectorAll('.dot');
                
                tips[currentTip].classList.remove('active');
                dots[currentTip].classList.remove('active');
                
                currentTip = index;
                
                tips[currentTip].classList.add('active');
                dots[currentTip].classList.add('active');
                
                tipsInterval = setInterval(rotateTips, 5000);
            });
        });
        
        const latestCard = document.getElementById('latest-quake-card');
        const feltList = document.getElementById('felt-quakes-list-container');
        const majorList = document.getElementById('recent-major-quakes-list-container');
        
        try {
            const [resAuto, resFelt, resMajor] = await Promise.all([
                fetch(API_URL_AUTOGEMPA),
                fetch(API_URL_GEMPA_DIRASAKAN),
                fetch(API_URL_GEMPA_TERKINI)
            ]);
            
            let allQuakes = [];
            
            // Latest quake
            if (resAuto.ok) {
                const data = await resAuto.json();
                const quake = data.Infogempa.gempa;
                renderLatestQuakeCard(quake, latestCard);
                allQuakes.push(quake);
                
                // Show live activity if quake is very recent (< 1 hour)
                const quakeTime = new Date(quake.DateTime);
                if ((new Date() - quakeTime) < 3600000) {
                    showLiveActivity(quake);
                }
            }
            
            // Felt quakes
            if (resFelt.ok) {
                const data = await resFelt.json();
                const felt = data.Infogempa.gempa.slice(0, 15);
                renderQuakeList(felt, feltList);
                document.getElementById('felt-badge').textContent = felt.length;
                allQuakes = allQuakes.concat(felt);
            }
            
            // Major quakes
            if (resMajor.ok) {
                const data = await resMajor.json();
                const major = data.Infogempa.gempa.slice(0, 15);
                renderQuakeList(major, majorList);
                document.getElementById('major-badge').textContent = major.length;
                allQuakes = allQuakes.concat(major);
            }
            
            // Remove duplicates
            const uniqueMap = new Map();
            allQuakes.forEach(q => {
                if (q.DateTime) uniqueMap.set(q.DateTime, q);
            });
            allQuakesData = Array.from(uniqueMap.values());
            
            // Update stats
            updateStats(allQuakesData);
            
            // Init mini map
            initMiniMap(allQuakesData);
            
            // Render timeline
            renderTimeline(allQuakesData);
            
            // Update last update time
            document.getElementById('last-update').textContent = new Date().toLocaleTimeString('id-ID');
            
        } catch (error) {
            console.error('Error:', error);
            showToast('Gagal memuat data', 'exclamation-circle');
        } finally {
            loadingEl.style.display = 'none';
        }
    }

    async function initDetailPage() {
        const params = new URLSearchParams(window.location.search);
        const quakeId = params.get('id');
        const detailContainer = document.getElementById('quake-detail-container');
        
        try {
            const [resDirasakan, resTerkini, resAuto] = await Promise.all([
                fetch(API_URL_GEMPA_DIRASAKAN),
                fetch(API_URL_GEMPA_TERKINI),
                fetch(API_URL_AUTOGEMPA)
            ]);
            
            let allQuakes = [];
            
            if (resDirasakan.ok) {
                const data = await resDirasakan.json();
                allQuakes = allQuakes.concat(data.Infogempa.gempa || []);
            }
            if (resTerkini.ok) {
                const data = await resTerkini.json();
                allQuakes = allQuakes.concat(data.Infogempa.gempa || []);
            }
            if (resAuto.ok) {
                const data = await resAuto.json();
                const auto = data.Infogempa.gempa;
                if (auto) allQuakes.push(auto);
            }
            
            const quakeMap = new Map();
            allQuakes.forEach(q => {
                if (q.DateTime) quakeMap.set(q.DateTime, q);
            });
            
            const uniqueQuakes = Array.from(quakeMap.values());
            const targetQuake = quakeId 
                ? uniqueQuakes.find(q => q.DateTime === decodeURIComponent(quakeId))
                : uniqueQuakes[0];
            
            if (!targetQuake) {
                throw new Error('Gempa tidak ditemukan');
            }
            
            currentQuakeData = targetQuake;
            renderDetailContent(targetQuake);
            
            // Initialize Map
            const [lat, lon] = targetQuake.Coordinates.split(',').map(c => parseFloat(c.trim()));
            
            if (currentMapInstance) {
                currentMapInstance.remove();
            }
            
            currentMapInstance = L.map('map', {
                zoomControl: false,
                attributionControl: false
            }).setView([lat, lon], 8);
            
            L.control.zoom({ position: 'bottomright' }).addTo(currentMapInstance);
            
            const currentTheme = document.documentElement.getAttribute('data-theme');
            updateMapTileLayer(currentTheme);
            
            const markerColor = getMagnitudeColor(targetQuake.Magnitude);
            
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    width: 24px; 
                    height: 24px; 
                    background: ${markerColor}; 
                    border: 3px solid white; 
                    border-radius: 50%; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                "></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            
            L.marker([lat, lon], { icon: customIcon })
                .addTo(currentMapInstance)
                .bindPopup(`
                    <div style="font-family: -apple-system, sans-serif; text-align: center;">
                        <div style="font-size: 18px; font-weight: 700; color: ${markerColor};">${targetQuake.Magnitude} M</div>
                        <div style="font-size: 13px; color: #666; margin-top: 4px;">${targetQuake.Wilayah}</div>
                    </div>
                `, { closeButton: false })
                .openPopup();
            
            setupDetailActions(targetQuake);
            
        } catch (error) {
            console.error('Error:', error);
            detailContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--ios-text-secondary);">
                    <i class="fas fa-triangle-exclamation" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Gagal memuat detail gempa</p>
                </div>
            `;
            showToast('Gagal memuat data', 'exclamation-circle');
        } finally {
            loadingEl.style.display = 'none';
        }
    }

    function setupDetailActions(quake) {
        const generateBtn = document.getElementById('generate-info-btn');
        const shareBtn = document.getElementById('share-btn');
        const copyBtn = document.getElementById('copy-text-btn');
        const outputBox = document.getElementById('generated-text-output');
        const textArea = document.getElementById('info-text-area');
        
        const generateText = () => {
            const [lat, lon] = quake.Coordinates.split(',');
            const mapsUrl = `https://maps.google.com/?q=${lat.trim()},${lon.trim()}`;
            
            return `🚨 INFO GEMPA BUMI

📍 Lokasi: ${quake.Wilayah}
🕐 Waktu: ${quake.Tanggal} ${quake.Jam} WIB
📊 Magnitudo: ${quake.Magnitude} M
↕️ Kedalaman: ${quake.Kedalaman}
🌊 Potensi Tsunami: ${quake.Potensi || 'Tidak ada'}

🗺️ Lokasi Peta: ${mapsUrl}

Sumber: BMKG Indonesia
https://live-update-gempa.vercel.app`;
        };
        
        generateBtn?.addEventListener('click', () => {
            textArea.value = generateText();
            outputBox.style.display = 'block';
            generateBtn.style.display = 'none';
            
            setTimeout(() => {
                textArea.select();
                textArea.setSelectionRange(0, 99999);
            }, 100);
        });
        
        copyBtn?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(textArea.value);
                showToast('Tersalin ke clipboard');
            } catch (err) {
                showToast('Gagal menyalin', 'exclamation-circle');
            }
        });
        
        shareBtn?.addEventListener('click', async () => {
            const text = generateText();
            
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `Gempa ${quake.Magnitude} M - ${quake.Wilayah}`,
                        text: text
                    });
                } catch (err) {
                    // User cancelled
                }
            } else {
                try {
                    await navigator.clipboard.writeText(text);
                    showToast('Tersalin ke clipboard (Share tidak didukung)');
                } catch (err) {
                    showToast('Gagal membagikan', 'exclamation-circle');
                }
            }
        });
    }

    // ==========================================
    // ROUTING
    // ==========================================
    if (document.getElementById('latest-quake-card')) {
        initIndexPage();
    } else if (document.getElementById('quake-detail-container')) {
        initDetailPage();
    }
});
