/**
 * TransitSync - Application UI Controller
 * Manages search execution, station autocompletion, leg-by-leg card rendering,
 * intermediate hub transfer details, class fare updates, dark/light theme switching,
 * station swap, and RapidAPI integration.
 */

document.addEventListener('DOMContentLoaded', () => {
  const api = window.railRadarAPI;
  const router = window.routeEngine;

  let currentSearchResults = null;
  let activeSort = 'arrival_match';
  let activeRouteType = 'all';
  let activeClass = '3A';
  let selectedClassesPerRoute = {};

  // DOM Elements
  const searchForm = document.getElementById('search-form');
  const fromInput = document.getElementById('from-station-input');
  const toInput = document.getElementById('to-station-input');
  const fromDropdown = document.getElementById('from-station-dropdown');
  const toDropdown = document.getElementById('to-station-dropdown');
  const btnSwapStations = document.getElementById('btn-swap-stations');
  const journeyDateInput = document.getElementById('journey-date-input');
  const targetArrivalTimeInput = document.getElementById('target-arrival-time');
  const minLayoverSelect = document.getElementById('min-layover-select');
  const maxLayoverSelect = document.getElementById('max-layover-select');
  
  const resultsHeader = document.getElementById('results-header');
  const resultsCountText = document.getElementById('results-count-text');
  const resultsSubtext = document.getElementById('results-subtext');
  const routesContainer = document.getElementById('routes-container');
  const sortTabs = document.querySelectorAll('.sort-tab');
  const routeTypeBtns = document.querySelectorAll('#route-type-filter .segmented-btn');
  const classFilterBtns = document.querySelectorAll('#class-filter .segmented-btn');
  const targetPresetBtns = document.querySelectorAll('#target-presets .segmented-btn');

  // Theme Elements
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  const themeToggleLabel = document.getElementById('theme-toggle-label');

  // Modals
  const modalApi = document.getElementById('modal-api-settings');
  const btnApiSettings = document.getElementById('btn-api-settings');
  const apiStatusBadge = document.getElementById('api-status-badge');
  const btnCloseApiModal = document.getElementById('btn-close-api-modal');
  const apiProviderSelect = document.getElementById('api-provider-select');
  const apiKeyInput = document.getElementById('api-key-input');
  const apiHostInput = document.getElementById('api-host-input');
  const btnTestApi = document.getElementById('btn-test-api-connection');
  const btnSaveApi = document.getElementById('btn-save-api-config');
  const apiPingResult = document.getElementById('api-ping-result');
  const apiLogsTerminal = document.getElementById('api-logs-terminal');
  const btnClearApiLogs = document.getElementById('btn-clear-api-logs');

  const modalHub = document.getElementById('modal-hub-guide');
  const hubModalTitle = document.getElementById('hub-modal-title');
  const hubModalBody = document.getElementById('hub-modal-body');
  const btnCloseHubModal = document.getElementById('btn-close-hub-modal');

  const modalHow = document.getElementById('modal-how-it-works');
  const btnHowItWorks = document.getElementById('btn-how-it-works');
  const btnCloseHowModal = document.getElementById('btn-close-how-modal');

  // -------------------------------------------------------------
  // Safe Theme Management (Dark / Light)
  // -------------------------------------------------------------
  function getSafeTheme() {
    try {
      return localStorage.getItem('transitsync_theme') || 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function setSafeTheme(theme) {
    try {
      localStorage.setItem('transitsync_theme', theme);
    } catch (e) {}
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) {
      document.body.setAttribute('data-theme', theme);
    }
    setSafeTheme(theme);
    
    if (themeToggleIcon) {
      themeToggleIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
    if (themeToggleLabel) {
      themeToggleLabel.textContent = theme === 'dark' ? 'Dark' : 'Light';
    }
  }

  // Apply initially saved theme
  applyTheme(getSafeTheme());

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      showToast(`${nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)} mode active`);
    });
  }

  // -------------------------------------------------------------
  // Station Swap / Exchange Button
  // -------------------------------------------------------------
  if (btnSwapStations) {
    btnSwapStations.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentFrom = fromInput.value;
      const currentTo = toInput.value;

      fromInput.value = currentTo;
      toInput.value = currentFrom;

      if (fromDropdown) fromDropdown.classList.remove('active');
      if (toDropdown) toDropdown.classList.remove('active');

      btnSwapStations.classList.add('rotate-anim');
      setTimeout(() => btnSwapStations.classList.remove('rotate-anim'), 300);

      showToast(`Swapped: ${fromInput.value} ➔ ${toInput.value}`);

      if (fromInput.value && toInput.value && fromInput.value !== toInput.value) {
        executeSearch();
      }
    });
  }

  // -------------------------------------------------------------
  // Default Journey Date (Tomorrow)
  // -------------------------------------------------------------
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (journeyDateInput) {
    journeyDateInput.value = tomorrow.toISOString().split('T')[0];
  }

  // Initialize API fields
  if (apiKeyInput && api) apiKeyInput.value = api.config.apiKey || '';
  if (apiHostInput && api) apiHostInput.value = api.config.apiHost || 'railradar-indian-railways.p.rapidapi.com';
  if (apiProviderSelect && api && api.config.provider) {
    apiProviderSelect.value = api.config.provider;
  }

  // Provider change
  if (apiProviderSelect) {
    apiProviderSelect.addEventListener('change', () => {
      const p = apiProviderSelect.value;
      if (p === 'railradar') {
        apiHostInput.value = 'railradar-indian-railways.p.rapidapi.com';
      } else if (p === 'irctc1') {
        apiHostInput.value = 'irctc1.p.rapidapi.com';
      }
    });
  }

  // -------------------------------------------------------------
  // Station Autocomplete
  // -------------------------------------------------------------
  const allStations = api ? api.getStations() : [];

  function setupAutocomplete(input, dropdown) {
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
      }

      const matches = allStations.filter(s => 
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q)
      ).slice(0, 8);

      if (matches.length === 0) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
      }

      dropdown.innerHTML = matches.map(s => `
        <div class="station-item" data-code="${s.code}">
          <div>
            <div class="station-item-name">${s.name}</div>
            <div class="station-item-city">${s.city}</div>
          </div>
          <span class="station-item-code">${s.code}</span>
        </div>
      `).join('');
      dropdown.classList.add('active');
    });

    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.station-item');
      if (item) {
        input.value = item.dataset.code;
        dropdown.classList.remove('active');
      }
    });
  }

  setupAutocomplete(fromInput, fromDropdown);
  setupAutocomplete(toInput, toDropdown);

  document.addEventListener('click', (e) => {
    if (fromInput && fromDropdown && !fromInput.contains(e.target) && !fromDropdown.contains(e.target)) {
      fromDropdown.classList.remove('active');
    }
    if (toInput && toDropdown && !toInput.contains(e.target) && !toDropdown.contains(e.target)) {
      toDropdown.classList.remove('active');
    }
  });

  // Quick Target Presets
  targetPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      targetPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (targetArrivalTimeInput) targetArrivalTimeInput.value = btn.dataset.time;
    });
  });

  // Class Filter
  classFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      classFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeClass = btn.dataset.class;
      if (currentSearchResults) {
        renderRoutes();
      }
    });
  });

  // Route Type Filter
  routeTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      routeTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRouteType = btn.dataset.type;
      if (currentSearchResults) {
        renderRoutes();
      }
    });
  });

  // Sort Tabs
  sortTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sortTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeSort = tab.dataset.sort;
      if (currentSearchResults) {
        renderRoutes();
      }
    });
  });

  // Submit Handler
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      executeSearch();
    });
  }

  // -------------------------------------------------------------
  // Execute Search
  // -------------------------------------------------------------
  async function executeSearch() {
    const from = fromInput.value.trim().toUpperCase();
    const to = toInput.value.trim().toUpperCase();
    const date = journeyDateInput.value;
    const targetArr = targetArrivalTimeInput.value || '09:30';
    const minLayoverRaw = parseInt(minLayoverSelect.value, 10);
    const minLayover = isNaN(minLayoverRaw) ? 45 : minLayoverRaw;
    const maxLayover = maxLayoverSelect ? (parseInt(maxLayoverSelect.value, 10) || 240) : 240;
    const allowLayover = minLayover > 0;

    if (!from || !to) {
      showToast('Enter Boarding & Destination stations');
      return;
    }

    if (from === to) {
      showToast('Boarding & Destination cannot be same');
      return;
    }

    routesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚡</div>
        <h3>Solving Routes...</h3>
        <p>Analyzing ${allowLayover ? 'direct & intermediate connections' : 'direct trains only (no layover)'} for <strong>${targetArr}</strong></p>
      </div>
    `;
    resultsHeader.style.display = 'none';

    try {
      const results = await router.findRoutes({
        fromStation: from,
        toStation: to,
        date,
        targetArrivalTime: targetArr,
        minLayoverMinutes: minLayover,
        maxLayoverMinutes: maxLayover,
        allowLayover: allowLayover,
        maxHops: allowLayover ? 1 : 0,
        preferredClass: activeClass
      });

      currentSearchResults = results;
      selectedClassesPerRoute = {};

      renderRoutes();
    } catch (err) {
      console.error('Error finding routes:', err);
      routesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Route Solver Error</h3>
          <p>${err.message || 'Unable to compute routes for the requested stations.'}</p>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------
  // Render Route Cards
  // -------------------------------------------------------------
  function renderRoutes() {
    if (!currentSearchResults || !currentSearchResults.routes) return;

    let routes = [...currentSearchResults.routes];

    if (activeRouteType === 'direct') {
      routes = routes.filter(r => r.isDirect);
    } else if (activeRouteType === 'connecting') {
      routes = routes.filter(r => !r.isDirect);
    }

    routes.sort((a, b) => {
      if (activeSort === 'arrival_match') {
        return b.scores.composite - a.scores.composite;
      } else if (activeSort === 'fastest') {
        return a.totalDurationMinutes - b.totalDurationMinutes;
      } else if (activeSort === 'safety') {
        return b.scores.safetyScore - a.scores.safetyScore;
      } else if (activeSort === 'fare') {
        const fareA = getRouteFare(a, selectedClassesPerRoute[a.id] || activeClass);
        const fareB = getRouteFare(b, selectedClassesPerRoute[b.id] || activeClass);
        return fareA - fareB;
      }
      return 0;
    });

    resultsHeader.style.display = 'flex';
    resultsCountText.textContent = `${routes.length} Routes Found`;
    resultsSubtext.textContent = `Target: ${currentSearchResults.targetArrivalTime} (${currentSearchResults.directCount} Direct, ${currentSearchResults.connectingCount} Connecting)`;

    if (routes.length === 0) {
      routesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No Routes Found</h3>
          <p>Try selecting "All" or adjusting your layover gap.</p>
        </div>
      `;
      return;
    }

    routesContainer.innerHTML = routes.map((route, idx) => {
      const isBestMatch = idx === 0 && activeSort === 'arrival_match';
      const selectedCls = selectedClassesPerRoute[route.id] || (route.combinedFares[activeClass] ? activeClass : Object.keys(route.combinedFares)[0]);

      return `
        <article class="route-card ${isBestMatch ? 'highlight-best' : ''}" id="card-${route.id}">
          
          <!-- Top Row -->
          <div class="route-card-top">
            <div class="route-badges">
              ${route.isDirect 
                ? '<span class="badge badge-direct">Direct</span>' 
                : `<span class="badge badge-connecting">Via ${route.transferStation}</span>`}
              
              <span class="badge badge-arrival-match">
                Arrives ${route.arrivalTime} (${route.arrivalDiffFormatted})
              </span>

              ${!route.isDirect ? `<span class="badge">${route.layoverFormatted} Layover</span>` : ''}
            </div>

            <div class="route-score-box">
              <span>Duration:</span>
              <span class="route-score-val">${route.totalDurationFormatted}</span>
            </div>
          </div>

          <!-- Step-by-Step Leg Breakdown -->
          <div class="legs-flow-container">
            
            <!-- Leg 1 -->
            <div class="leg-step-card">
              <div class="leg-step-num">LEG 1</div>
              <div class="leg-main-info">
                <div class="leg-train-title">
                  <span class="leg-train-num">#${route.legs[0].trainNumber}</span>
                  <span>${route.legs[0].trainName}</span>
                </div>
                <div class="leg-route-times">
                  <div class="leg-time-box">
                    <strong>${route.legs[0].departureTime}</strong> ${route.legs[0].from}
                  </div>
                  <span>➔</span>
                  <div class="leg-time-box">
                    <strong>${route.legs[0].arrivalTime}</strong> ${route.legs[0].to}
                  </div>
                </div>
              </div>
              <div class="leg-duration-badge">
                ${route.legs[0].duration}
              </div>
            </div>

            <!-- Intermediate Transfer -->
            ${!route.isDirect ? `
              <div class="intermediate-transfer-box">
                <div class="transfer-station-heading">
                  <h4>Transfer at ${route.transferStation}</h4>
                  <span>Arr: <strong>${route.hubTransfers[0].arriveAt}</strong> ➔ Dep: <strong>${route.hubTransfers[0].departAt}</strong></span>
                </div>
                <div class="transfer-metrics">
                  <span class="badge badge-connecting">
                    ${route.layoverFormatted} Layover
                  </span>
                  <button type="button" class="btn btn-secondary btn-sm btn-view-hub-guide" data-hub="${route.transferStation}">
                    Hub Guide
                  </button>
                </div>
              </div>

              <!-- Leg 2 -->
              <div class="leg-step-card">
                <div class="leg-step-num">LEG 2</div>
                <div class="leg-main-info">
                  <div class="leg-train-title">
                    <span class="leg-train-num">#${route.legs[1].trainNumber}</span>
                    <span>${route.legs[1].trainName}</span>
                  </div>
                  <div class="leg-route-times">
                    <div class="leg-time-box">
                      <strong>${route.legs[1].departureTime}</strong> ${route.legs[1].from}
                    </div>
                    <span>➔</span>
                    <div class="leg-time-box">
                      <strong>${route.legs[1].arrivalTime}</strong> ${route.legs[1].to}
                    </div>
                  </div>
                </div>
                <div class="leg-duration-badge">
                  ${route.legs[1].duration}
                </div>
              </div>
            ` : ''}

          </div>

          <!-- Class Fare Chips & Actions -->
          <div class="class-fare-row">
            <div class="classes-list">
              ${Object.entries(route.combinedFares).map(([cls, fare]) => {
                const isSelected = cls === selectedCls;
                const seatInfo = getCombinedSeats(route, cls);
                return `
                  <div class="class-chip ${isSelected ? 'active' : ''}" data-route-id="${route.id}" data-class="${cls}">
                    <span class="class-code">${cls}</span>
                    <span class="class-price">₹${fare.toLocaleString('en-IN')}</span>
                    <span class="class-seats">${seatInfo.text}</span>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="route-actions">
              <button type="button" class="btn btn-secondary btn-sm btn-toggle-stops" data-route-id="${route.id}">
                Halts
              </button>
              <button type="button" class="btn btn-primary btn-sm btn-copy-itinerary" data-route-id="${route.id}">
                Copy Itinerary
              </button>
            </div>
          </div>

          <!-- Stops Drawer -->
          <div class="stops-drawer" id="stops-drawer-${route.id}">
            ${route.legs.map(leg => `
              <div style="margin-bottom: 10px;">
                <h5 style="color: var(--accent-primary); font-size: 12px; margin-bottom: 4px;">
                  Train #${leg.trainNumber} - ${leg.trainName} (${leg.from} ➔ ${leg.to})
                </h5>
                <table class="stops-table">
                  <thead>
                    <tr>
                      <th>Station</th>
                      <th>Arr</th>
                      <th>Dep</th>
                      <th>Class Fares</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${leg.stops && leg.stops.length > 0 ? leg.stops.map(st => `
                      <tr>
                        <td><strong>${st.code}</strong></td>
                        <td>${st.arr || '--'}</td>
                        <td>${st.dep || '--'}</td>
                        <td>${leg.fares ? Object.entries(leg.fares).map(([c, p]) => `${c}: ₹${p}`).join(' | ') : 'Standard'}</td>
                      </tr>
                    `).join('') : `
                      <tr>
                        <td>${leg.from}</td>
                        <td>--</td>
                        <td>${leg.departureTime}</td>
                        <td>--</td>
                      </tr>
                      <tr>
                        <td>${leg.to}</td>
                        <td>${leg.arrivalTime}</td>
                        <td>--</td>
                        <td>${leg.fares ? Object.entries(leg.fares).map(([c, p]) => `${c}: ₹${p}`).join(' | ') : '--'}</td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>
            `).join('')}
          </div>

        </article>
      `;
    }).join('');

    attachCardEventListeners(routes);
  }

  function getRouteFare(route, cls) {
    if (!route.combinedFares) return 1000;
    return route.combinedFares[cls] || Object.values(route.combinedFares)[0] || 1000;
  }

  function getCombinedSeats(route, cls) {
    if (route.isDirect) {
      const seats = route.legs[0].seatsAvailable && route.legs[0].seatsAvailable[cls];
      if (seats) return { text: seats };
      return { text: 'AVL' };
    } else {
      const s1 = (route.legs[0].seatsAvailable && route.legs[0].seatsAvailable[cls]) || 'AVL';
      const s2 = (route.legs[1].seatsAvailable && route.legs[1].seatsAvailable[cls]) || 'AVL';
      if (s1.includes('AVL') && s2.includes('AVL')) {
        return { text: 'AVL' };
      } else if (s1.includes('RAC') || s2.includes('RAC')) {
        return { text: 'RAC' };
      }
      return { text: 'AVL' };
    }
  }

  function attachCardEventListeners(routes) {
    document.querySelectorAll('.class-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const routeId = chip.dataset.routeId;
        const cls = chip.dataset.class;
        selectedClassesPerRoute[routeId] = cls;
        
        const card = document.getElementById(`card-${routeId}`);
        if (card) {
          card.querySelectorAll('.class-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        }
      });
    });

    document.querySelectorAll('.btn-toggle-stops').forEach(btn => {
      btn.addEventListener('click', () => {
        const routeId = btn.dataset.routeId;
        const drawer = document.getElementById(`stops-drawer-${routeId}`);
        if (drawer) {
          drawer.classList.toggle('active');
          btn.textContent = drawer.classList.contains('active') ? 'Hide Halts' : 'Halts';
        }
      });
    });

    document.querySelectorAll('.btn-view-hub-guide').forEach(btn => {
      btn.addEventListener('click', () => {
        const hubCode = btn.dataset.hub;
        openHubModal(hubCode);
      });
    });

    document.querySelectorAll('.btn-copy-itinerary').forEach(btn => {
      btn.addEventListener('click', () => {
        const routeId = btn.dataset.routeId;
        const route = routes.find(r => r.id === routeId);
        if (!route) return;

        const selectedCls = selectedClassesPerRoute[route.id] || activeClass;
        let itineraryText = `🚆 TransitSync Itinerary\n`;
        itineraryText += `Route: ${route.fromStation} ➔ ${route.toStation} | Date: ${currentSearchResults.date}\n`;
        itineraryText += `Target Arrival: ${currentSearchResults.targetArrivalTime} | Arrival: ${route.arrivalTime}\n\n`;

        route.legs.forEach((leg, i) => {
          itineraryText += `Leg ${i+1}: Train #${leg.trainNumber} (${leg.trainName})\n`;
          itineraryText += `Departs: ${leg.departureTime} (${leg.from}) ➔ Arrives: ${leg.arrivalTime} (${leg.to})\n`;
          itineraryText += `Class: ${selectedCls} (Fare: ₹${(leg.fares && leg.fares[selectedCls]) || 800})\n\n`;
        });

        if (!route.isDirect) {
          itineraryText += `Transfer: ${route.transferStation} (${route.layoverFormatted} Layover)\n`;
        }

        itineraryText += `Total Fare: ₹${getRouteFare(route, selectedCls).toLocaleString('en-IN')}\n`;
        itineraryText += `Book on IRCTC: https://www.irctc.co.in\n`;

        navigator.clipboard.writeText(itineraryText).then(() => {
          showToast('Itinerary copied to clipboard!');
        }).catch(() => {
          showToast('Itinerary ready');
        });
      });
    });
  }

  // -------------------------------------------------------------
  // Interchange Hub Modal
  // -------------------------------------------------------------
  function openHubModal(hubCode) {
    const hub = api.getHubDetails(hubCode);
    hubModalTitle.innerHTML = `Hub Guide: ${hub.name} (${hub.code})`;
    hubModalBody.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
        <div style="background: var(--bg-card); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 10px;">
          <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase;">Platforms</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${hub.platforms || 8}</div>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 10px;">
          <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase;">Min Buffer</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--accent-primary);">${hub.minTransferBufferMins || 35} mins</div>
        </div>
      </div>

      <div style="background: var(--bg-card); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 10px;">
        <h4 style="font-size: 12px; color: var(--text-primary); margin-bottom: 4px;">Station Amenities:</h4>
        <ul style="list-style-type: none; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11.5px; color: var(--text-secondary);">
          ${(hub.amenities || []).map(a => `<li>• ${a}</li>`).join('')}
        </ul>
      </div>
    `;
    modalHub.classList.add('active');
  }

  // -------------------------------------------------------------
  // Modals & API Settings
  // -------------------------------------------------------------
  if (btnApiSettings) btnApiSettings.addEventListener('click', () => modalApi.classList.add('active'));
  if (apiStatusBadge) apiStatusBadge.addEventListener('click', () => modalApi.classList.add('active'));
  if (btnCloseApiModal) btnCloseApiModal.addEventListener('click', () => modalApi.classList.remove('active'));
  if (btnCloseHubModal) btnCloseHubModal.addEventListener('click', () => modalHub.classList.remove('active'));
  if (btnHowItWorks) btnHowItWorks.addEventListener('click', () => modalHow.classList.add('active'));
  if (btnCloseHowModal) btnCloseHowModal.addEventListener('click', () => modalHow.classList.remove('active'));

  // Test Ping
  if (btnTestApi) {
    btnTestApi.addEventListener('click', async () => {
      const key = apiKeyInput.value.trim();
      const host = apiHostInput.value.trim();
      apiPingResult.textContent = 'Testing...';

      const res = await api.testConnection(key, host);
      apiPingResult.textContent = `${res.message}`;
    });
  }

  // Save Settings
  if (btnSaveApi) {
    btnSaveApi.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      const host = apiHostInput.value.trim();
      const provider = apiProviderSelect.value;
      api.saveConfig({
        apiKey: key,
        apiHost: host,
        provider: provider,
        useLiveApi: !!key
      });

      const statusText = document.getElementById('api-status-text');
      if (statusText) {
        if (key) {
          statusText.textContent = 'Live Connected';
        } else {
          statusText.textContent = 'Engine Active';
        }
      }

      showToast('API Configuration Saved');
      modalApi.classList.remove('active');
    });
  }

  if (btnClearApiLogs) {
    btnClearApiLogs.addEventListener('click', () => {
      apiLogsTerminal.innerHTML = '';
    });
  }

  window.addEventListener('chronosrail:api-log', (e) => {
    if (!apiLogsTerminal) return;
    const log = e.detail;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-time">[${log.timestamp}]</span>
      <span class="log-status">${log.status}</span>
      <span>${log.type} ${log.endpoint}</span>
    `;
    apiLogsTerminal.prepend(entry);
  });

  [modalApi, modalHub, modalHow].forEach(m => {
    if (m) {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('active');
      });
    }
  });

  function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }

  // Initial search trigger
  setTimeout(() => {
    executeSearch();
  }, 150);
});
