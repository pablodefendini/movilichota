// ============================================================
// MoviliChota PR — App Logic
// Supabase-backed anonymous bus lane violation reporter
// ============================================================

// --- Configuration ---
// Replace these with your Supabase project values
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const STORAGE_BUCKET = 'report-images';
const PAGE_SIZE = 20;

// --- Infraction Labels ---
const INFRACTION_LABELS = {
  'estacionado': 'Estacionado en carril',
  'doble-fila': 'Doble fila — entregas',
  'detenido': 'Detenido sin emergencia',
  'parada-no-autorizada': 'Parada no autorizada',
  'bloqueando-parada': 'Bloqueando parada',
  'taxi-rideshare': 'Taxi/rideshare en carril',
  'circulando': 'Circulando por carril exclusivo',
};

// --- State ---
let supabase = null;
let currentPage = 0;
let allLoaded = false;
let selectedFile = null;

// --- DOM Refs ---
const form = document.getElementById('report-form');
const infractionSelect = document.getElementById('infraction-type');
const photoInput = document.getElementById('photo-input');
const uploadArea = document.getElementById('upload-area');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const photoPreview = document.getElementById('photo-preview');
const descriptionInput = document.getElementById('description');
const btnSubmit = document.getElementById('btn-submit');
const submitStatus = document.getElementById('submit-status');
const feed = document.getElementById('feed');
const feedEmpty = document.getElementById('feed-empty');
const feedLoading = document.getElementById('feed-loading');
const btnLoadMore = document.getElementById('btn-load-more');
const reportCount = document.getElementById('report-count');

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    showDemoMode();
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setupForm();
  loadFeed();
  setupRealtime();
  loadCount();
});

// --- Demo Mode (no Supabase configured) ---
function showDemoMode() {
  setupForm();
  feedLoading.hidden = true;

  // Load demo data from localStorage as fallback
  const demos = JSON.parse(localStorage.getItem('movilichota_demos') || '[]');
  if (demos.length === 0) {
    feedEmpty.hidden = false;
  } else {
    demos.forEach(d => appendCard(d, false));
  }
  reportCount.textContent = demos.length;
}

function saveDemoReport(report) {
  const demos = JSON.parse(localStorage.getItem('movilichota_demos') || '[]');
  demos.unshift(report);
  localStorage.setItem('movilichota_demos', JSON.stringify(demos));
}

// --- Form Setup ---
function setupForm() {
  // Photo upload click
  uploadArea.addEventListener('click', () => photoInput.click());

  // Drag & drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  // File selected
  photoInput.addEventListener('change', () => {
    if (photoInput.files.length) handleFile(photoInput.files[0]);
  });

  // Form submit
  form.addEventListener('submit', handleSubmit);
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) return;
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    photoPreview.src = e.target.result;
    photoPreview.classList.add('visible');
    uploadPlaceholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// --- Submit ---
async function handleSubmit(e) {
  e.preventDefault();

  const type = infractionSelect.value;
  if (!type) return;

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Enviando…';
  submitStatus.hidden = true;

  try {
    let imageUrl = null;

    if (selectedFile) {
      if (supabase) {
        // Upload to Supabase Storage
        const ext = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(fileName, selectedFile, { contentType: selectedFile.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;
      } else {
        // Demo mode: store as data URL
        imageUrl = photoPreview.src;
      }
    }

    const report = {
      infraction_type: type,
      image_url: imageUrl,
      description: descriptionInput.value.trim() || null,
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      const { error } = await supabase.from('reports').insert([report]);
      if (error) throw error;
    } else {
      // Demo mode
      report.id = Date.now();
      saveDemoReport(report);
      prependCard(report);
      const count = JSON.parse(localStorage.getItem('movilichota_demos') || '[]').length;
      reportCount.textContent = count;
    }

    // Reset form
    form.reset();
    selectedFile = null;
    photoPreview.classList.remove('visible');
    photoPreview.src = '';
    uploadPlaceholder.style.display = '';
    feedEmpty.hidden = true;

    showStatus('success', '¡Reporte enviado! Gracias por reportar.');
  } catch (err) {
    console.error(err);
    showStatus('error', 'Error al enviar. Intenta de nuevo.');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>
      </svg>
      Reportar`;
  }
}

function showStatus(type, msg) {
  submitStatus.hidden = false;
  submitStatus.className = `submit-status ${type}`;
  submitStatus.textContent = msg;
  setTimeout(() => { submitStatus.hidden = true; }, 4000);
}

// --- Feed Loading ---
async function loadFeed() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

  feedLoading.hidden = true;

  if (error) {
    console.error(error);
    return;
  }

  if (data.length === 0 && currentPage === 0) {
    feedEmpty.hidden = false;
    return;
  }

  data.forEach(report => appendCard(report, false));

  if (data.length < PAGE_SIZE) {
    allLoaded = true;
  } else {
    btnLoadMore.hidden = false;
    btnLoadMore.onclick = () => {
      currentPage++;
      loadFeed();
    };
  }
}

async function loadCount() {
  if (!supabase) return;
  const { count, error } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true });

  if (!error && count !== null) {
    reportCount.textContent = count.toLocaleString();
  }
}

// --- Realtime ---
function setupRealtime() {
  if (!supabase) return;

  supabase
    .channel('reports-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload) => {
      prependCard(payload.new);
      feedEmpty.hidden = true;
      // Update count
      const current = parseInt(reportCount.textContent.replace(/,/g, '')) || 0;
      reportCount.textContent = (current + 1).toLocaleString();
    })
    .subscribe();
}

// --- Card Rendering ---
function createCard(report, isNew) {
  const card = document.createElement('article');
  card.className = `feed-card${isNew ? ' is-new' : ''}`;

  const label = INFRACTION_LABELS[report.infraction_type] || report.infraction_type;

  let imgHtml = '';
  if (report.image_url) {
    imgHtml = `<img class="feed-card-image" src="${escapeAttr(report.image_url)}" alt="Foto de infracción: ${escapeAttr(label)}" loading="lazy">`;
  }

  let descHtml = '';
  if (report.description) {
    descHtml = `<p class="feed-card-description">${escapeHtml(report.description)}</p>`;
  }

  card.innerHTML = `
    ${imgHtml}
    <div class="feed-card-body">
      <span class="feed-card-tag">${escapeHtml(label)}</span>
      ${descHtml}
      <div class="feed-card-time">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
        ${timeAgo(report.created_at)}
      </div>
    </div>`;

  return card;
}

function appendCard(report, isNew = false) {
  feed.appendChild(createCard(report, isNew));
}

function prependCard(report) {
  const card = createCard(report, true);
  feed.prepend(card);
}

// --- Utilities ---

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return 'hace un momento';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `hace ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  if (diff < 2592000) {
    const d = Math.floor(diff / 86400);
    return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  }
  return new Date(dateStr).toLocaleDateString('es-PR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
