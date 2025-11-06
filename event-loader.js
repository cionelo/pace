// event-loader.js - Handles event selection and loading

/**
 * Load events manifest and populate dropdown
 */
async function loadEventsManifest() {
  try {
    const response = await fetch('./data/events.json');
    if (!response.ok) {
      throw new Error(`Failed to load events manifest: ${response.status}`);
    }
    const events = await response.json();
    return events;
  } catch (error) {
    console.error('[event-loader] Error loading events:', error);
    return [];
  }
}

/**
 * Populate the event selector dropdown
 */
function populateEventSelector(events) {
  const select = document.getElementById('eventSelect');
  if (!select) return;

  // Clear existing options except the first one
  select.innerHTML = '<option value="">Choose a race...</option>';

  // Add an option for each event
  events.forEach(event => {
    const option = document.createElement('option');
    option.value = event.id;
    option.textContent = `${event.name} - ${event.date}`;
    select.appendChild(option);
  });

  console.log(`[event-loader] Populated ${events.length} events`);
}

/**
 * Initialize event selector on page load
 */
async function initEventSelector() {
  const events = await loadEventsManifest();
  
  if (events.length === 0) {
    console.warn('[event-loader] No events found in manifest');
    const select = document.getElementById('eventSelect');
    if (select) {
      select.innerHTML = '<option value="">No races available yet</option>';
      select.disabled = true;
    }
    return;
  }

  populateEventSelector(events);

  // Wire up the load button
  const loadBtn = document.getElementById('loadEventBtn');
  const select = document.getElementById('eventSelect');

  if (loadBtn && select) {
    loadBtn.addEventListener('click', async () => {
      const eventId = select.value;
      
      if (!eventId) {
        alert('Please select a race first');
        return;
      }

      console.log(`[event-loader] Loading event: ${eventId}`);
      
      // Call the main app's loadEvent function
      if (typeof window.loadEvent === 'function') {
        try {
          loadBtn.disabled = true;
          loadBtn.textContent = 'Loading...';
          
          await window.loadEvent(eventId);
          
          loadBtn.textContent = 'Load Race Data';
          loadBtn.disabled = false;
        } catch (error) {
          console.error('[event-loader] Error loading event:', error);
          alert(`Error loading race data: ${error.message}`);
          loadBtn.textContent = 'Load Race Data';
          loadBtn.disabled = false;
        }
      } else {
        console.error('[event-loader] window.loadEvent function not found');
        alert('Error: App initialization failed');
      }
    });

    // Allow loading by pressing Enter in the dropdown
    select.addEventListener('change', () => {
      if (select.value) {
        loadBtn.click();
      }
    });
  }

  // Auto-load first event on page load (optional)
  // Uncomment the lines below if you want the first race to load automatically
  /*
  if (events.length > 0) {
    select.value = events[0].id;
    loadBtn.click();
  }
  */
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEventSelector);
} else {
  initEventSelector();
}

// Export for testing/console use
window.loadEventsManifest = loadEventsManifest;
window.populateEventSelector = populateEventSelector;
