// Supabase Client Initialization
let supabaseClient = null;
let refreshInterval = null;

// DOM Elements - Auth & Containers
const loginContainer = document.getElementById('login-container');
const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password');

const dashboardContainer = document.getElementById('dashboard-container');
const logoutBtn = document.getElementById('logout-btn');

// DOM Elements - Devices
const devicesList = document.getElementById('devices-list');
const deviceCountBadge = document.getElementById('device-count-badge');

// DOM Elements - Tasks
const tasksList = document.getElementById('tasks-list');
const newTaskBtn = document.getElementById('new-task-btn');
const taskFilters = document.querySelectorAll('.filter-btn');

// DOM Elements - Task Modal Form Fields
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const taskIdInput = document.getElementById('task-id');
const taskNotifInput = document.getElementById('task-notification-id');
const taskTitleInput = document.getElementById('task-title');
const taskDescInput = document.getElementById('task-desc');
const taskGuideInput = document.getElementById('task-guide');
const taskEbysNoInput = document.getElementById('task-ebys-no');
const taskAssigneeInput = document.getElementById('task-assignee');
const taskSourceBranchInput = document.getElementById('task-source-branch');
const taskDestinationInput = document.getElementById('task-destination');
const taskCoverLetterInput = document.getElementById('task-cover-letter');
const taskRecurrenceSelect = document.getElementById('task-recurrence');
const taskPrioritySelect = document.getElementById('task-priority');
const taskStatusSelect = document.getElementById('task-status');
const taskStartDateInput = document.getElementById('task-start-date');
const taskEndDateInput = document.getElementById('task-end-date');

const modalTitle = document.getElementById('modal-title');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

// Stats Counters
const countAll = document.getElementById('count-all');
const countActive = document.getElementById('count-active');
const countCompleted = document.getElementById('count-completed');

// Local States
let allTasks = [];
let activeFilter = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Validate Configuration
  if (!CONFIG || CONFIG.SUPABASE_URL.includes('YOUR_SUPABASE_PROJECT')) {
    alert('Lütfen web/config.js dosyasındaki Supabase URL ve Anon Key bilgilerinizi güncelleyin!');
    return;
  }

  // Initialize Supabase Client
  const { createClient } = window.supabase;
  supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  const isLoggedIn = sessionStorage.getItem('admin_logged_in') === 'true';
  if (isLoggedIn) {
    showDashboard();
  } else {
    showLogin();
  }
});

// Toast System
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.style.animation = 'fadeIn 0.3s reverse forwards';
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// Auth Actions
function showLogin() {
  loginContainer.classList.remove('hidden');
  dashboardContainer.classList.add('hidden');
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function showDashboard() {
  loginContainer.classList.add('hidden');
  dashboardContainer.classList.remove('hidden');
  fetchDevices();
  fetchTasks();

  // Poll for changes every 5 seconds (Real-time updates)
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    fetchDevices();
    fetchTasks();
  }, 5000);
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const password = passwordInput.value;

  if (password === CONFIG.ADMIN_PASSWORD) {
    sessionStorage.setItem('admin_logged_in', 'true');
    showToast('Giriş başarılı!', 'success');
    showDashboard();
    passwordInput.value = '';
  } else {
    showToast('Şifre hatalı!', 'error');
  }
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('admin_logged_in');
  showToast('Çıkış yapıldı.', 'info');
  showLogin();
});

// ----------------------------------------------------
// DEVICES MANAGEMENT
// ----------------------------------------------------
async function fetchDevices() {
  try {
    const { data: devices, error } = await supabaseClient
      .from('devices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    renderDevices(devices || []);
  } catch (error) {
    console.error(error);
  }
}

function renderDevices(devices) {
  deviceCountBadge.textContent = `${devices.length} Cihaz`;

  if (devices.length === 0) {
    devicesList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-mobile-screen"></i>
        <span>Kayıtlı cihaz bulunmuyor.</span>
      </div>
    `;
    return;
  }

  devicesList.innerHTML = '';
  devices.forEach(device => {
    const card = document.createElement('div');
    card.className = 'device-card';

    let badgeClass = 'badge-pending';
    let badgeText = 'Onay Bekliyor';
    if (device.status === 'approved') {
      badgeClass = 'badge-approved';
      badgeText = 'Onaylı';
    } else if (device.status === 'blocked') {
      badgeClass = 'badge-blocked';
      badgeText = 'Engelli';
    }

    let actionButtons = '';
    if (device.status === 'pending') {
      actionButtons = `
        <button class="btn btn-success btn-xs" onclick="updateDeviceStatus('${device.id}', 'approved')">Onayla</button>
        <button class="btn btn-danger btn-xs" onclick="updateDeviceStatus('${device.id}', 'blocked')">Engelle</button>
      `;
    } else if (device.status === 'approved') {
      actionButtons = `
        <button class="btn btn-danger btn-xs" onclick="updateDeviceStatus('${device.id}', 'blocked')">Engelle</button>
      `;
    } else if (device.status === 'blocked') {
      actionButtons = `
        <button class="btn btn-success btn-xs" onclick="updateDeviceStatus('${device.id}', 'approved')">Onayla</button>
        <button class="btn btn-secondary btn-xs" onclick="deleteDevice('${device.id}')">Sil</button>
      `;
    }

    const date = new Date(device.created_at).toLocaleString('tr-TR');

    card.innerHTML = `
      <div class="device-info">
        <div>
          <span class="device-title">${escapeHTML(device.name)}</span>
          <div class="device-id">ID: ${device.id}</div>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="device-info">
        <span class="device-date"><i class="fa-solid fa-clock"></i> ${date}</span>
        <div class="device-actions">
          ${actionButtons}
        </div>
      </div>
    `;
    devicesList.appendChild(card);
  });
}

async function updateDeviceStatus(deviceId, status) {
  try {
    const { error } = await supabaseClient
      .from('devices')
      .update({ status })
      .eq('id', deviceId);

    if (error) throw error;
    showToast('Cihaz durumu güncellendi.', 'success');
    fetchDevices();
  } catch (error) {
    showToast('Bulut veritabanı hatası!', 'error');
  }
}

async function deleteDevice(deviceId) {
  if (!confirm('Bu cihaz kaydını silmek istediğinize emin misiniz?')) return;

  try {
    const { error } = await supabaseClient
      .from('devices')
      .delete()
      .eq('id', deviceId);

    if (error) throw error;
    showToast('Cihaz kaydı silindi.', 'success');
    fetchDevices();
  } catch (error) {
    showToast('Silme işlemi başarısız!', 'error');
  }
}

// ----------------------------------------------------
// TASKS MANAGEMENT
// ----------------------------------------------------
async function fetchTasks() {
  try {
    const { data: tasks, error } = await supabaseClient
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allTasks = tasks || [];
    updateStats();
    renderTasks();
  } catch (error) {
    console.error(error);
  }
}

function updateStats() {
  const total = allTasks.length;
  const active = allTasks.filter(t => t.status !== 'done').length;
  const completed = allTasks.filter(t => t.status === 'done').length;

  countAll.textContent = total;
  countActive.textContent = active;
  countCompleted.textContent = completed;
}

function renderTasks() {
  const filtered = allTasks.filter(task => {
    if (activeFilter === 'active') return task.status !== 'done';
    if (activeFilter === 'completed') return task.status === 'done';
    return true;
  });

  if (filtered.length === 0) {
    tasksList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-clipboard-check"></i>
        <span>Görev bulunmuyor.</span>
      </div>
    `;
    return;
  }

  tasksList.innerHTML = '';
  filtered.forEach(task => {
    const card = document.createElement('div');
    const isCompleted = task.status === 'done';
    card.className = `task-card ${isCompleted ? 'completed' : ''}`;

    const date = new Date(task.end_date || task.due_date);
    const now = new Date();
    const isOverdue = !isCompleted && date < now;
    const formattedDate = date.toLocaleString('tr-TR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    const currentPriority = task.priority || 'Orta';
    const priorityClass = currentPriority === 'Yüksek' ? 'high' : currentPriority === 'Orta' ? 'medium' : 'low';
    const statusLabel = task.status === 'todo' ? 'Yapılacak' : task.status === 'in_progress' ? 'Yapılıyor' : 'Tamamlandı';
    const statusClass = task.status === 'in_progress' ? 'badge-blue' : isCompleted ? 'badge-green' : 'badge-gray';

    // Build extra fields indicators
    let extraMeta = '';
    if (task.assignee && task.assignee !== 'Atanmamış') {
      extraMeta += `<span class="task-assignee-badge"><i class="fa-solid fa-user"></i> ${escapeHTML(task.assignee)}</span>`;
    }
    if (task.ebys_no) {
      extraMeta += `<span class="task-ebys-badge"><i class="fa-solid fa-file-invoice"></i> EBYS: ${escapeHTML(task.ebys_no)}</span>`;
    }
    if (task.source_branch || task.destination) {
      extraMeta += `<span class="task-branch-badge"><i class="fa-solid fa-building"></i> ${escapeHTML(task.source_branch || 'Birim')} &rarr; ${escapeHTML(task.destination || 'Alıcı')}</span>`;
    }

    card.innerHTML = `
      <div class="task-priority-line priority-${priorityClass}"></div>
      <div class="task-card-left">
        <div class="task-checkbox" onclick="toggleTaskComplete('${task.id}')">
          <i class="fa-solid fa-check"></i>
        </div>
        <div class="task-details">
          <div class="task-title" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</div>
          ${task.desc ? `<div class="task-desc">${escapeHTML(task.desc)}</div>` : ''}
          ${task.guide ? `<div class="task-guide-preview" style="font-size: 11px; color: var(--text-secondary); opacity: 0.8; margin-top: 3px; font-style: italic;"><i class="fa-solid fa-info-circle"></i> Kılavuz: ${escapeHTML(task.guide)}</div>` : ''}
          <div class="task-meta" style="flex-wrap: wrap; gap: 6px; margin-top: 6px;">
            <span class="task-date-badge ${isOverdue ? 'overdue' : ''}">
              <i class="fa-solid fa-calendar-day"></i> ${formattedDate} ${isOverdue ? '(Gecikti)' : ''}
            </span>
            <span class="badge priority-${priorityClass}">${currentPriority}</span>
            <span class="badge ${statusClass}">${statusLabel}</span>
            ${extraMeta}
          </div>
        </div>
      </div>
      <div class="task-card-right">
        <button class="btn-icon btn-edit" onclick="editTask('${task.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn-icon btn-delete" onclick="deleteTaskItem('${task.id}')"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    tasksList.appendChild(card);
  });
}

// Filter Actions
taskFilters.forEach(btn => {
  btn.addEventListener('click', () => {
    taskFilters.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderTasks();
  });
});

async function toggleTaskComplete(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  const nextStatusState = task.status === 'done' ? 'todo' : 'done';

  try {
    const { error } = await supabaseClient
      .from('tasks')
      .update({
        status: nextStatusState,
        notification_id: nextStatusState === 'done' ? null : task.notification_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId);

    if (error) throw error;
    showToast(nextStatusState === 'done' ? 'Görev tamamlandı.' : 'Görev aktif hale getirildi.', 'success');
    fetchTasks();
  } catch (error) {
    showToast('Durum güncellenemedi!', 'error');
  }
}

async function deleteTaskItem(taskId) {
  if (!confirm('Bu görevi silmek istediğinize emin misiniz?')) return;

  try {
    const { error } = await supabaseClient
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;
    showToast('Görev silindi.', 'success');
    fetchTasks();
  } catch (error) {
    showToast('Görev silinemedi!', 'error');
  }
}

// ----------------------------------------------------
// TASK MODAL ACTIONS
// ----------------------------------------------------
newTaskBtn.addEventListener('click', () => {
  modalTitle.textContent = 'Yeni Görev Ekle';
  taskForm.reset();
  taskIdInput.value = '';
  taskNotifInput.value = '';
  
  // Set default start time (now)
  const startDate = new Date();
  const startLocalISO = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000))
    .toISOString()
    .slice(0, 16);
  taskStartDateInput.value = startLocalISO;

  // Set default end time (1 hour from now)
  const endDate = new Date();
  endDate.setHours(endDate.getHours() + 1);
  endDate.setMinutes(0);
  const endLocalISO = new Date(endDate.getTime() - (endDate.getTimezoneOffset() * 60000))
    .toISOString()
    .slice(0, 16);
  taskEndDateInput.value = endLocalISO;
  
  taskModal.classList.remove('hidden');
});

function editTask(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  modalTitle.textContent = 'Görevi Düzenle';
  taskIdInput.value = task.id;
  taskNotifInput.value = task.notification_id || '';
  taskTitleInput.value = task.title;
  taskDescInput.value = task.desc || '';
  taskGuideInput.value = task.guide || '';
  taskEbysNoInput.value = task.ebys_no || '';
  taskAssigneeInput.value = task.assignee || 'Atanmamış';
  taskSourceBranchInput.value = task.source_branch || '';
  taskDestinationInput.value = task.destination || '';
  taskCoverLetterInput.value = task.cover_letter || '';
  taskRecurrenceSelect.value = task.recurrence || 'none';
  taskPrioritySelect.value = task.priority || 'Orta';
  taskStatusSelect.value = task.status || 'todo';

  const startD = new Date(task.start_date || task.created_at || new Date());
  const startLocalISO = new Date(startD.getTime() - (startD.getTimezoneOffset() * 60000))
    .toISOString()
    .slice(0, 16);
  taskStartDateInput.value = startLocalISO;

  const endD = new Date(task.end_date || task.due_date || new Date());
  const endLocalISO = new Date(endD.getTime() - (endD.getTimezoneOffset() * 60000))
    .toISOString()
    .slice(0, 16);
  taskEndDateInput.value = endLocalISO;

  taskModal.classList.remove('hidden');
}

function closeModal() {
  taskModal.classList.add('hidden');
}

modalCloseBtn.addEventListener('click', closeModal);
modalCancelBtn.addEventListener('click', closeModal);

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = taskIdInput.value;
  const title = taskTitleInput.value.trim();
  const desc = taskDescInput.value.trim();
  const guide = taskGuideInput.value.trim();
  const ebys_no = taskEbysNoInput.value.trim();
  const assignee = taskAssigneeInput.value.trim();
  const source_branch = taskSourceBranchInput.value.trim();
  const destination = taskDestinationInput.value.trim();
  const cover_letter = taskCoverLetterInput.value.trim();
  const recurrence = taskRecurrenceSelect.value;
  const priority = taskPrioritySelect.value;
  const status = taskStatusSelect.value;
  const notification_id = taskNotifInput.value;

  const start_date = new Date(taskStartDateInput.value).toISOString();
  const end_date = new Date(taskEndDateInput.value).toISOString();

  try {
    if (id) {
      // Update Task on Supabase
      const { error } = await supabaseClient
        .from('tasks')
        .update({
          title,
          desc,
          guide,
          ebys_no,
          assignee,
          source_branch,
          destination,
          cover_letter,
          recurrence,
          priority,
          status,
          start_date,
          end_date,
          notification_id: notification_id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      showToast('Görev güncellendi.', 'success');
    } else {
      // Insert Task on Supabase
      const newId = `task_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
      const { error } = await supabaseClient
        .from('tasks')
        .insert([{
          id: newId,
          title,
          desc,
          guide,
          ebys_no,
          assignee,
          source_branch,
          destination,
          cover_letter,
          recurrence,
          priority,
          status,
          start_date,
          end_date,
          notification_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (error) throw error;
      showToast('Görev oluşturuldu.', 'success');
    }

    closeModal();
    fetchTasks();
  } catch (error) {
    showToast('Görev kaydedilemedi!', 'error');
  }
});

// Helper: Escape HTML
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
