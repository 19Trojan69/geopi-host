// ============================
// Konfiguration
// ============================

// Domain ist geopi.app, aber für den Code selbst nicht direkt nötig.
// Entscheidend sind MapTiler + Supabase:

const MAPTILER_KEY = "CreAh02QGNcepAT2Zcfm";
const SUPABASE_URL = "https://mubfgqihjdczrsadrhhz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11YmZncWloamRjenJzYWRyaGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMDczMTAsImV4cCI6MjA3ODc4MzMxMH0.0i2S0o4rOB4I2Np-tPnvMjYfIsB_CZZdZ5w_I83UAk4"; //

// ============================
// Init Supabase
// ============================

let supabase = null;

try {
  supabase = window.Supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  console.error("Supabase init error:", err);
}

// ============================
// Pi SDK – Testnet Setup
// ============================

const isPiBrowser = typeof window.Pi !== "undefined";

async function initPi() {
  const statusPi = document.querySelector("#status-pi .badge");

  if (!isPiBrowser) {
    statusPi.textContent = "Kein Pi-Browser";
    statusPi.className = "badge badge-error";
    document.getElementById("test-payment-btn").disabled = true;
    document.getElementById("pi-browser-hint").disabled = false;
    return;
  }

  try {
    window.Pi.init({ version: "2.0", network: "Testnet" });

    statusPi.textContent = "Pi-Browser erkannt";
    statusPi.className = "badge badge-ok";

    document.getElementById("pi-browser-hint").style.display = "none";
    document.getElementById("test-payment-btn").disabled = false;

    document
      .getElementById("test-payment-btn")
      .addEventListener("click", handleTestPayment);
  } catch (err) {
    console.error("Pi init failed:", err);
    statusPi.textContent = "Fehler beim Init";
    statusPi.className = "badge badge-error";
  }
}

async function handleTestPayment() {
  if (!isPiBrowser || !window.Pi) {
    alert("Bitte im Pi-Browser öffnen, um Testzahlungen auszuführen.");
    return;
  }

  try {
    const payment = await window.Pi.createPayment({
      amount: 0.01,
      memo: "GeoPi Testzahlung",
      metadata: { type: "test", app: "geopi" },
    });

    console.log("Payment started:", payment);
    alert("Testzahlung gestartet – siehe Pi-Browser Zahlungsfenster.");
  } catch (err) {
    console.error("Payment error:", err);
    alert("Zahlung abgebrochen oder fehlgeschlagen.");
  }
}

// ============================
// MapLibre + Supabase-Locations
// ============================

let map;
let currentStyle = "streets";
let markers = [];
let lastPlaces = [];

function initMap() {
  const styleStreets = `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`;
  const styleSatellite = `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`;

  map = new maplibregl.Map({
    container: "map",
    style: styleSatellite,
    center: [0, 20],
    zoom: 2,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        map.flyTo({ center: [longitude, latitude], zoom: 9 });
      },
      () => {
        console.log("Geolocation abgelehnt – bleibe in Weltansicht.");
      }
    );
  }

  document.getElementById("toggle-style").addEventListener("click", () => {
    currentStyle = currentStyle === "streets" ? "sat" : "streets";
    map.setStyle(
      currentStyle === "streets" ? styleStreets : styleSatellite
    );
  });

  document.getElementById("locate-me-btn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation wird von deinem Gerät nicht unterstützt.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        map.flyTo({ center: [longitude, latitude], zoom: 10 });
      },
      () => {
        alert("Konnte deinen Standort nicht abrufen.");
      }
    );
  });

  map.on("moveend", () => {
    document.getElementById("form-message").textContent = "";
  });
}

async function loadPlaces() {
  const statusSupabase = document.querySelector("#status-supabase .badge");
  if (!supabase) {
    statusSupabase.textContent = "Supabase Fehler";
    statusSupabase.className = "badge badge-error";
    return;
  }

  statusSupabase.textContent = "Lade...";
  statusSupabase.className = "badge badge-pending";

  try {
    const { data, error } = await supabase.from("places").select("*");

    if (error) throw error;

    lastPlaces = data || [];
    renderMarkers(lastPlaces);

    statusSupabase.textContent = `Verbunden · ${lastPlaces.length} Orte`;
    statusSupabase.className = "badge badge-ok";
  } catch (err) {
    console.error("Supabase load error:", err);
    statusSupabase.textContent = "Fehler beim Laden";
    statusSupabase.className = "badge badge-error";
  }
}

function clearMarkers() {
  markers.forEach((m) => m.remove());
  markers = [];
}

function markerColorForCategory(cat) {
  switch (cat) {
    case "merchant":
      return "#ffcc4d";
    case "service":
      return "#4dd2ff";
    case "event":
      return "#ff6bcb";
    case "atm":
      return "#6bff8a";
    default:
      return "#ffffff";
  }
}

function renderMarkers(places) {
  if (!map) return;
  clearMarkers();

  places.forEach((place) => {
    const lat = place.latitude ?? place.lat;
    const lon = place.longitude ?? place.lng ?? place.lon;

    if (lat == null || lon == null) return;

    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "999px";
    el.style.border = "2px solid rgba(0,0,0,0.7)";
    el.style.background = markerColorForCategory(place.category);

    const popupHtml = `
      <div style="min-width:180px;">
        <strong>${place.name ?? "Unbenannter Ort"}</strong><br/>
        <small>${place.city ?? ""} ${place.country ?? ""}</small><br/>
        <small>Kategorie: ${place.category ?? "-"}</small><br/>
        ${
          place.description
            ? `<small>${place.description}</small><br/>`
            : ""
        }
      </div>
    `;

    const marker = new maplibregl.Marker(el)
      .setLngLat([lon, lat])
      .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(popupHtml))
      .addTo(map);

    markers.push(marker);
  });
}

function applyFilters() {
  const cat = document.getElementById("category-select").value;
  const search = document
    .getElementById("search-input")
    .value.toLowerCase()
    .trim();

  const filtered = lastPlaces.filter((p) => {
    let ok = true;
    if (cat !== "all") ok = ok && p.category === cat;

    if (search) {
      const hay = [
        p.name,
        p.city,
        p.country,
        p.description,
        p.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      ok = ok && hay.includes(search);
    }

    return ok;
  });

  renderMarkers(filtered);
}

// ============================
// Location-Formular
// ============================

function initForm() {
  const formPanel = document.getElementById("register-form");
  const openBtn = document.getElementById("open-register-form");
  const formMsg = document.getElementById("form-message");

  openBtn.addEventListener("click", () => {
    formPanel.classList.toggle("hidden");
  });

  document
    .getElementById("form-use-map-coords")
    .addEventListener("click", (e) => {
      e.preventDefault();
      if (!map) return;

      const center = map.getCenter();
      formPanel.dataset.lat = center.lat.toString();
      formPanel.dataset.lng = center.lng.toString();
      formMsg.textContent = `Koordinaten übernommen: ${center.lat.toFixed(
        5
      )}, ${center.lng.toFixed(5)}`;
      formMsg.style.color = "#f2b01e";
    });

  document
    .getElementById("form-submit")
    .addEventListener("click", async (e) => {
      e.preventDefault();
      if (!supabase) return;

      formMsg.textContent = "";
      formMsg.style.color = "#c3bde6";

      const name = document.getElementById("form-name").value.trim();
      const city = document.getElementById("form-city").value.trim();
      const country = document.getElementById("form-country").value.trim();
      const category = document.getElementById("form-category").value;
      const description =
        document.getElementById("form-description").value.trim();

      const lat = parseFloat(formPanel.dataset.lat || "0");
      const lng = parseFloat(formPanel.dataset.lng || "0");

      if (!name) {
        formMsg.textContent = "Bitte mindestens einen Namen eingeben.";
        formMsg.style.color = "#ff4b5c";
        return;
      }

      try {
        const { error } = await supabase.from("places").insert({
          name,
          city,
          country,
          category,
          description,
          latitude: lat || null,
          longitude: lng || null,
        });

        if (error) throw error;

        formMsg.textContent = "Standort gespeichert (Test).";
        formMsg.style.color = "#3ad17c";

        document.getElementById("form-name").value = "";
        document.getElementById("form-city").value = "";
        document.getElementById("form-country").value = "";
        document.getElementById("form-description").value = "";
        delete formPanel.dataset.lat;
        delete formPanel.dataset.lng;

        await loadPlaces();
      } catch (err) {
        console.error("Insert error:", err);
        formMsg.textContent =
          "Fehler beim Speichern. Details in der Browser-Konsole.";
        formMsg.style.color = "#ff4b5c";
      }
    });
}

// ============================
// UI Basics
// ============================

function initUi() {
  const menuToggle = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");

  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  document
    .getElementById("category-select")
    .addEventListener("change", applyFilters);
  document
    .getElementById("search-input")
    .addEventListener("input", applyFilters);
}

// ============================
// Start
// ============================

window.addEventListener("DOMContentLoaded", async () => {
  initUi();
  initForm();
  initMap();
  await initPi();
  await loadPlaces();
});
