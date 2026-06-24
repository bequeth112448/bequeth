/**
 * Stratejik Yönetim Portal - Mobil Çevrimdışı Uygulama Mantığı
 * Tamamen internetsiz çalışır, tüm verileri (personel, görevler, mesailer) localStorage'da saklar.
 */
const DB_NAME = "StratejikMobilDB";
const DB_VERSION = 1;

const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("photos")) {
                db.createObjectStore("photos");
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
};

const savePhoto = async (sicil, base64Data) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("photos", "readwrite");
        const store = tx.objectStore("photos");
        store.put(base64Data, sicil);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
};

// Yerel Stil Mobil Onay ve Uyarı Pencereleri (Tarayıcı varsayılanları yerine)
const CustomDialog = {
    confirm(title, message, options = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const msgEl = document.getElementById('confirm-modal-message');
            const iconEl = document.getElementById('confirm-modal-icon');
            const cancelBtn = document.getElementById('btn-confirm-cancel');
            const okBtn = document.getElementById('btn-confirm-ok');
            
            titleEl.textContent = title;
            msgEl.textContent = message;
            iconEl.textContent = options.icon || 'warning';
            okBtn.textContent = options.okText || 'Evet';
            cancelBtn.textContent = options.cancelText || 'İptal';
            
            if (options.type === 'danger') {
                okBtn.className = "btn btn-danger";
            } else {
                okBtn.className = "btn btn-primary";
            }
            
            modal.style.display = 'flex';
            
            const cleanup = (result) => {
                modal.style.display = 'none';
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                resolve(result);
            };
            
            const onOk = () => cleanup(true);
            const onCancel = () => cleanup(false);
            
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
        });
    },
    alert(title, message, options = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const msgEl = document.getElementById('confirm-modal-message');
            const iconEl = document.getElementById('confirm-modal-icon');
            const cancelBtn = document.getElementById('btn-confirm-cancel');
            const okBtn = document.getElementById('btn-confirm-ok');
            
            titleEl.textContent = title;
            msgEl.textContent = message;
            iconEl.textContent = options.icon || 'info';
            okBtn.textContent = options.okText || 'Tamam';
            
            cancelBtn.style.display = 'none';
            okBtn.className = "btn btn-primary btn-block";
            
            modal.style.display = 'flex';
            
            const onOk = () => {
                modal.style.display = 'none';
                cancelBtn.style.display = 'inline-flex';
                okBtn.removeEventListener('click', onOk);
                resolve(true);
            };
            okBtn.addEventListener('click', onOk);
        });
    }
};

const App = {
    state: {
        currentUser: null,      // Giriş yapan yerel kullanıcı
        tasks: [],              // Yerel görevler listesi
        personnel: [],          // Çevrimdışı yüklenen personel listesi
        dutyRegistry: [],       // Mesai ve dış görev kayıtları
        logs: [],               // Yerel işlem güvenlik logları
        activeTab: 'tab-dashboard',
        currentTaskStatusTab: 'todo',
        photoCache: {}          // Fotoğraf önbelleği (IndexedDB)
    },

    // Uygulama Başlangıcı
    async init() {
        console.log("Çevrimdışı Mobil portal başlatılıyor...");
        this.initTheme();
        this.initOfflineDatabase();
        
        // Fotoğrafları IndexedDB'den belleğe yükle
        await this.loadPhotoCache();
        
        this.bindEvents();
        
        // Kilit ekranını gizle (Çevrimdışı sürümde bağlantı kilidi yoktur)
        const lockOverlay = document.getElementById('access-lock-overlay');
        if (lockOverlay) lockOverlay.style.display = 'none';

        // İlk render işlemlerini gerçekleştir
        this.renderDashboard();
        this.renderTasks();
        this.populateDutyPersonnelSelect();
        this.renderDutyRegistry();
        this.renderPersonnelList();
        this.renderAdminPanel();
    },

    // Tema Ayarı
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const themeIcon = document.querySelector('#btn-theme-toggle .material-symbols-outlined');
        if (themeIcon) {
            themeIcon.textContent = savedTheme === 'dark' ? 'dark_mode' : 'light_mode';
        }
    },

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        const themeIcon = document.querySelector('#btn-theme-toggle .material-symbols-outlined');
        if (themeIcon) {
            themeIcon.textContent = newTheme === 'dark' ? 'dark_mode' : 'light_mode';
        }
        this.addLog("THEME_CHANGE", `Mobil tema "${newTheme}" olarak değiştirildi.`);
    },

    // Yerel Veritabanını Başlat (LocalStorage)
    initOfflineDatabase() {
        // Kullanıcı
        if (!localStorage.getItem('off_currentUser')) {
            const defaultUser = { computer_name: "MOBİL.YETKİLİ", role: "Yönetici", status: "Aktif" };
            localStorage.setItem('off_currentUser', JSON.stringify(defaultUser));
        }
        this.state.currentUser = JSON.parse(localStorage.getItem('off_currentUser'));

        // Personel Listesi (Boşsa INITIAL_PERSONNEL verisini yükle)
        if (!localStorage.getItem('off_personnel')) {
            localStorage.setItem('off_personnel', JSON.stringify(INITIAL_PERSONNEL));
        }
        this.state.personnel = JSON.parse(localStorage.getItem('off_personnel'));

        // Görevler (Boşsa INITIAL_TASKS verisini yükle)
        if (!localStorage.getItem('off_tasks')) {
            localStorage.setItem('off_tasks', JSON.stringify(INITIAL_TASKS));
        }
        this.state.tasks = JSON.parse(localStorage.getItem('off_tasks'));

        // Nöbet / Mesai Kayıtları
        if (!localStorage.getItem('off_duties')) {
            localStorage.setItem('off_duties', JSON.stringify([]));
        }
        this.state.dutyRegistry = JSON.parse(localStorage.getItem('off_duties'));

        // Güvenlik Logları
        if (!localStorage.getItem('off_logs')) {
            const initialLog = [{
                event_type: "SYSTEM_INIT",
                details: "Çevrimdışı veri tabanı başarıyla başlatıldı. 629 personel yüklendi.",
                timestamp: new Date().toLocaleString('tr-TR'),
                ip: "Cihaz İçi"
            }];
            localStorage.setItem('off_logs', JSON.stringify(initialLog));
        }
        this.state.logs = JSON.parse(localStorage.getItem('off_logs'));
    },

    // Veritabanını Diske Kaydet
    saveDatabase() {
        localStorage.setItem('off_currentUser', JSON.stringify(this.state.currentUser));
        localStorage.setItem('off_personnel', JSON.stringify(this.state.personnel));
        localStorage.setItem('off_tasks', JSON.stringify(this.state.tasks));
        localStorage.setItem('off_duties', JSON.stringify(this.state.dutyRegistry));
        localStorage.setItem('off_logs', JSON.stringify(this.state.logs));
    },

    // Yeni İşlem Logu Ekle
    addLog(eventType, details) {
        const newLog = {
            event_type: eventType,
            details: details,
            timestamp: new Date().toLocaleString('tr-TR'),
            ip: "Cihaz İçi"
        };
        this.state.logs.push(newLog);
        // Maksimum 100 log tut
        if (this.state.logs.length > 100) {
            this.state.logs.shift();
        }
        this.saveDatabase();
    },

    // Olay Dinleyicileri
    bindEvents() {
        // Alt Sekme Değişikliği
        const tabButtons = document.querySelectorAll('.bottom-nav-item');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // Sağ Üst Ayarlar ve Tema
        const themeBtn = document.getElementById('btn-theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => this.toggleTheme());
        }
        document.getElementById('btn-settings-toggle').addEventListener('click', () => this.openSettingsModal());
        document.getElementById('btn-close-settings').addEventListener('click', () => this.closeSettingsModal());
        document.getElementById('btn-save-settings').addEventListener('click', () => this.resetDatabaseToDefault());

        // Durum Değiştirici Çipi Tetikleme (Alttan Açılan Durum Menüsü)
        const statusTrigger = document.getElementById('user-status-trigger');
        if (statusTrigger) {
            statusTrigger.addEventListener('click', () => {
                const currentStatus = this.state.currentUser.status || 'Aktif';
                document.querySelectorAll('.status-option-item').forEach(item => {
                    if (item.getAttribute('data-value') === currentStatus) {
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                });
                document.getElementById('status-sheet').style.display = 'block';
            });
        }

        // Durum Seçim Menüsü Kapatma
        const closeStatusSheetBtn = document.getElementById('btn-close-status-sheet');
        if (closeStatusSheetBtn) {
            closeStatusSheetBtn.addEventListener('click', () => {
                document.getElementById('status-sheet').style.display = 'none';
            });
        }

        // Durum Seçeneklerine Tıklanma
        const statusOptions = document.querySelectorAll('.status-option-item');
        statusOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                const status = opt.getAttribute('data-value');
                this.state.currentUser.status = status;
                this.addLog("PROFILE_UPDATE", `Mobil kullanıcı durumunu "${status}" olarak güncelledi.`);
                this.saveDatabase();
                this.showToast(`Durumunuz "${status}" yapıldı.`, "success");
                document.getElementById('status-sheet').style.display = 'none';
                this.renderDashboard();
            });
        });

        // Görev Segment Seçimi (Akıcı Geçişlerle)
        const segmentButtons = document.querySelectorAll('.segment-btn');
        segmentButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                segmentButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.currentTaskStatusTab = btn.getAttribute('data-status');
                this.renderTasks(true); // İskelet geçiş animasyonlu
            });
        });

        // Personel Arama ve Sıfırlama Eylemleri
        const searchInput = document.getElementById('search-p-general');
        const clearSearchBtn = document.getElementById('btn-clear-search');
        if (searchInput && clearSearchBtn) {
            searchInput.addEventListener('input', () => {
                if (searchInput.value.trim().length > 0) {
                    clearSearchBtn.style.display = 'flex';
                } else {
                    clearSearchBtn.style.display = 'none';
                }
                this.renderPersonnelList();
            });
            
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                this.renderPersonnelList();
            });
        }

        // Mesai Kaydet
        document.getElementById('btn-save-duty').addEventListener('click', () => this.saveDutyRecord());

        // Bottom Sheet Kapat
        document.getElementById('btn-close-sheet').addEventListener('click', () => this.closeBottomSheet());

        // Görev Ekleme Modalı Kapatma & Kaydetme
        const closeTaskModalBtn = document.getElementById('btn-close-task-modal');
        if (closeTaskModalBtn) {
            closeTaskModalBtn.addEventListener('click', () => this.closeAddTaskModal());
        }
        const saveTaskBtn = document.getElementById('btn-save-task');
        if (saveTaskBtn) {
            saveTaskBtn.addEventListener('click', () => this.saveTaskOffline());
        }
    },

    // Sekme Geçişi (Native iskelet ekran tetikleyicili)
    switchTab(tabId) {
        document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));

        const targetPane = document.getElementById(tabId);
        const targetBtn = document.querySelector(`.bottom-nav-item[data-tab="${tabId}"]`);

        if (targetPane && targetBtn) {
            targetPane.classList.add('active');
            targetBtn.classList.add('active');
            this.state.activeTab = tabId;
            
            if (tabId === 'tab-personnel') this.renderPersonnelList(true);
            if (tabId === 'tab-tasks') this.renderTasks(true);
            if (tabId === 'tab-duty') this.renderDutyRegistry();
            if (tabId === 'tab-admin') this.renderAdminPanel();
        }
    },

    // --- ANASAYFA ---
    renderDashboard() {
        document.getElementById('user-computer-name').textContent = this.state.currentUser.computer_name;
        
        const role = this.state.currentUser.role || 'Misafir';
        const roleBadge = document.getElementById('user-role-badge');
        if (roleBadge) {
            roleBadge.textContent = role;
            roleBadge.className = "role-badge";
            if (role === 'Yönetici') roleBadge.classList.add('role-admin');
            else if (role === 'Yetkili') roleBadge.classList.add('role-yetkili');
            else roleBadge.classList.add('role-misafir');
        }

        // Özel durum seçici butonunu güncelle
        const statusTextEl = document.getElementById('user-status-text');
        const statusDotEl = document.getElementById('user-status-dot');
        if (statusTextEl && statusDotEl) {
            const statusLabel = this.state.currentUser.status || 'Aktif';
            statusTextEl.textContent = statusLabel;
            statusDotEl.className = 'status-dot-indicator';
            if (statusLabel === 'Aktif') statusDotEl.classList.add('status-aktif');
            else if (statusLabel === 'Meşgul') statusDotEl.classList.add('status-mesgul');
            else if (statusLabel === 'Dış Görev') statusDotEl.classList.add('status-dis-gorev');
            else if (statusLabel === 'İzinli') statusDotEl.classList.add('status-izinli');
        }

        // İstatistikler
        document.getElementById('stat-total-p').textContent = this.state.personnel.length;
        
        const todoTasks = this.state.tasks.filter(t => t.status === 'todo').length;
        document.getElementById('stat-pending-tasks').textContent = todoTasks;

        const doneTasks = this.state.tasks.filter(t => t.status === 'done').length;
        const doneTasksEl = document.getElementById('stat-done-tasks');
        if (doneTasksEl) doneTasksEl.textContent = doneTasks;

        const totalDuties = this.state.dutyRegistry ? this.state.dutyRegistry.length : 0;
        const totalDutiesEl = document.getElementById('stat-total-duties');
        if (totalDutiesEl) totalDutiesEl.textContent = totalDuties;

        // Yönetici sekmesini alt navbarda göster
        const adminBtn = document.getElementById('bottom-nav-btn-admin');
        if (adminBtn) adminBtn.style.display = 'inline-flex';
    },

    // --- GÖREVLER ---
    renderTasks(showSkeleton = false) {
        const container = document.getElementById('tasks-container');
        if (!container) return;

        // Sayaçları güncelle
        document.getElementById('task-count-todo').textContent = this.state.tasks.filter(t => t.status === 'todo').length;
        document.getElementById('task-count-inprogress').textContent = this.state.tasks.filter(t => t.status === 'inprogress').length;
        document.getElementById('task-count-done').textContent = this.state.tasks.filter(t => t.status === 'done').length;

        if (showSkeleton) {
            let skeletonHtml = '';
            for (let i = 0; i < 3; i++) {
                skeletonHtml += `
                    <div class="glass-card skeleton-list-item" style="flex-direction:column; align-items:stretch; gap:10px; padding:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div class="skeleton-box skeleton-text-1" style="width:55%; height:14px;"></div>
                            <div class="skeleton-box skeleton-text-2" style="width:20%; height:12px;"></div>
                        </div>
                        <div class="skeleton-box skeleton-text-2" style="width:85%; height:18px; margin-top:6px;"></div>
                        <div style="display:flex; justify-content:space-between; margin-top:10px; border-top:1px solid rgba(255,255,255,0.03); padding-top:10px;">
                            <div class="skeleton-box skeleton-text-2" style="width:30%; height:10px;"></div>
                            <div class="skeleton-box skeleton-text-2" style="width:25%; height:10px;"></div>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = skeletonHtml;
            setTimeout(() => this.renderTasks(false), 200);
            return;
        }

        const filtered = this.state.tasks.filter(t => t.status === this.state.currentTaskStatusTab);

        if (filtered.length === 0) {
            container.innerHTML = '<div class="loading-placeholder">Görev bulunamadı.</div>';
            return;
        }

        let html = '';
        filtered.forEach(task => {
            const prioClass = `priority-${(task.priority || 'medium').toLowerCase()}`;
            const prioText = (task.priority === 'high' ? 'YÜKSEK' : task.priority === 'medium' ? 'ORTA' : 'DÜŞÜK');
            
            html += `
                <div class="task-mobile-card ${prioClass}" onclick="App.openTaskDetails('${task.id}')">
                    <div class="task-mobile-card-header">
                        <span class="task-title">${this.escapeHTML(task.title)}</span>
                        <span class="task-priority-badge">${prioText}</span>
                    </div>
                    <div class="task-mobile-card-body">
                        <p>${this.escapeHTML(task.desc || 'Açıklama girilmemiş.')}</p>
                    </div>
                    <div class="task-mobile-card-footer">
                        <span>Bitiş: ${task.end_date || 'Girilmemiş'}</span>
                        <span class="task-assignee">${this.escapeHTML(task.assignee || 'Atanmamış')}</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    openTaskDetails(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;

        const contentHtml = `
            <div style="display:flex; flex-direction:column; gap:12px; font-size:0.82rem;">
                <div>
                    <strong>Görev Başlığı:</strong>
                    <div style="font-size:0.95rem; font-weight:700; margin-top:3px;">${this.escapeHTML(task.title)}</div>
                </div>
                <div>
                    <strong>Görev Açıklaması:</strong>
                    <p style="color:var(--text-secondary); margin-top:3px; line-height:1.4;">${this.escapeHTML(task.desc || '-')}</p>
                </div>
                <div>
                    <strong>Yönerge / Detay:</strong>
                    <p style="color:var(--text-secondary); margin-top:3px; line-height:1.4;">${this.escapeHTML(task.guide || '-')}</p>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; border-top:1px solid var(--glass-border); padding-top:10px;">
                    <div>
                        <strong>Sorumlu Personel:</strong>
                        <div style="color:var(--text-secondary);">${this.escapeHTML(task.assignee || 'Atanmamış')}</div>
                    </div>
                    <div>
                        <strong>Öncelik Seviyesi:</strong>
                        <div style="color:var(--text-secondary);">${this.escapeHTML(task.priority || 'Normal')}</div>
                    </div>
                </div>
                
                <!-- MOBİL DURUM GEÇİŞ BUTONLARI (PREMIUM MOBİL UX) -->
                <div style="border-top:1px solid var(--glass-border); padding-top:12px; margin-top:5px;">
                    <strong style="display:block; margin-bottom:8px;">Görevin Durumunu Güncelle:</strong>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-secondary btn-block" style="padding:8px 4px; font-size:0.75rem; background:${task.status === 'todo' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)'}; color:white;" onclick="App.updateTaskStatusOffline('${task.id}', 'todo')">Yapılacak</button>
                        <button class="btn btn-secondary btn-block" style="padding:8px 4px; font-size:0.75rem; background:${task.status === 'inprogress' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)'}; color:white;" onclick="App.updateTaskStatusOffline('${task.id}', 'inprogress')">İşlemde</button>
                        <button class="btn btn-secondary btn-block" style="padding:8px 4px; font-size:0.75rem; background:${task.status === 'done' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)'}; color:white;" onclick="App.updateTaskStatusOffline('${task.id}', 'done')">Yapıldı</button>
                    </div>
                </div>

                <!-- GÖREV SİLME BUTONU -->
                <button class="btn btn-danger btn-block" style="margin-top: 8px; padding: 10px; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="App.deleteTaskOffline('${task.id}')">
                    <span class="material-symbols-outlined" style="font-size: 1.1rem;">delete</span> Görevi Sil
                </button>
            </div>
        `;

        document.getElementById('bs-title').textContent = "Görev Bilgisi";
        document.getElementById('bottom-sheet-body-content').innerHTML = contentHtml;
        this.openBottomSheet();
    },

    updateTaskStatusOffline(taskId, newStatus) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (task) {
            const oldStatus = task.status;
            task.status = newStatus;
            this.addLog("TASK_UPDATE", `"${task.title}" görevinin durumu "${oldStatus}" -> "${newStatus}" yapıldı.`);
            this.saveDatabase();
            this.renderTasks();
            this.renderDashboard();
            this.showToast("Görev durumu güncellendi", "success");
            this.closeBottomSheet();
        }
    },

    async deleteTaskOffline(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;

        const confirmed = await this.showConfirmDialog("Görevi Sil", `"${task.title}" görevini kalıcı olarak silmek istiyor musunuz?`, "Sil", "İptal", "danger");
        if (!confirmed) return;

        this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
        this.addLog("TASK_DELETE", `"${task.title}" görevi silindi.`);
        this.saveDatabase();
        this.renderTasks();
        this.renderDashboard();
        this.showToast("Görev silindi", "success");
        this.closeBottomSheet();
    },

    openAddTaskModal() {
        document.getElementById('settings-modal').style.display = 'none';
        document.getElementById('status-sheet').style.display = 'none';
        const modal = document.getElementById('task-modal');
        if (!modal) return;

        document.getElementById('task-form-title').value = '';
        document.getElementById('task-form-desc').value = '';
        document.getElementById('task-form-priority').value = 'Orta';
        document.getElementById('task-form-date').value = '';
        
        this.populateTaskPersonnelSelect();
        modal.style.display = 'flex';
    },

    closeAddTaskModal() {
        const modal = document.getElementById('task-modal');
        if (modal) modal.style.display = 'none';
    },

    populateTaskPersonnelSelect() {
        const select = document.getElementById('task-form-assignee');
        if (!select) return;

        select.innerHTML = '<option value="Atanmamış">Atanmamış</option>';
        
        // Stratejik şube personelini doldur
        const filtered = this.state.personnel.filter(p => p.department && p.department.trim() === 'Stratejik Yönetim Şube Müdürlüğü');
        const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

        sorted.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = `${p.name} (${p.sicil})`;
            select.appendChild(opt);
        });
    },

    saveTaskOffline() {
        const title = document.getElementById('task-form-title').value.trim();
        const desc = document.getElementById('task-form-desc').value.trim();
        const priority = document.getElementById('task-form-priority').value;
        const date = document.getElementById('task-form-date').value;
        const assignee = document.getElementById('task-form-assignee').value;

        if (!title) {
            this.showToast("Görev başlığı boş olamaz.", "error");
            return;
        }

        // Tarihi GG.AA.YYYY formatına çevirelim
        let end_date = '';
        if (date) {
            const parts = date.split('-');
            if (parts.length === 3) {
                end_date = `${parts[2]}.${parts[1]}.${parts[0]}`;
            }
        }

        const newTask = {
            id: Math.random().toString(36).substring(2, 10),
            title: title,
            desc: desc,
            priority: priority,
            end_date: end_date || 'Girilmemiş',
            assignee: assignee,
            status: 'todo',
            created_at: new Date().toLocaleDateString('tr-TR')
        };

        this.state.tasks.push(newTask);
        this.addLog("TASK_CREATE", `Yerel yeni görev oluşturuldu: "${title}"`);
        this.saveDatabase();
        this.renderTasks();
        this.renderDashboard();
        this.closeAddTaskModal();
        this.showToast("Yeni görev başarıyla eklendi.", "success");
    },

    // --- PERSONEL SORGULAMA ---
    renderPersonnelList(showSkeleton = false) {
        const container = document.getElementById('personnel-container');
        if (!container) return;

        if (showSkeleton) {
            let skeletonHtml = '';
            for (let i = 0; i < 5; i++) {
                skeletonHtml += `
                    <div class="glass-card skeleton-list-item">
                        <div class="skeleton-box skeleton-avatar"></div>
                        <div class="skeleton-details">
                            <div class="skeleton-box skeleton-text-1" style="width: 55%; height: 12px;"></div>
                            <div class="skeleton-box skeleton-text-2" style="width: 35%; height: 8px;"></div>
                            <div class="skeleton-box skeleton-text-2" style="width: 25%; height: 6px; margin-top: 2px;"></div>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = skeletonHtml;
            setTimeout(() => this.renderPersonnelList(false), 250);
            return;
        }

        const query = document.getElementById('search-p-general').value.trim().toLowerCase();
        
        const filtered = this.state.personnel.filter(p => {
            const searchText = `${p.name} ${p.sicil} ${p.title} ${p.department}`.toLowerCase();
            return query === '' || searchText.includes(query);
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div class="loading-placeholder">Personel bulunamadı.</div>';
            return;
        }

        // İlk 50 personeli göster (Performans kısıtlaması için)
        const sliced = filtered.slice(0, 50);

        let html = '';
        sliced.forEach(p => {
            const photoSrc = (this.state.photoCache && this.state.photoCache[p.sicil]) ? this.state.photoCache[p.sicil] : (window.location.protocol !== 'file:' ? `/api/photo?sicil=${p.sicil}` : 'polislogo.png');
            html += `
                <div class="glass-card personnel-item-card" onclick="App.openPersonnelDetails('${p.sicil}')">
                    <img src="${photoSrc}" class="p-item-photo">
                    <div class="p-item-info">
                        <h4>${this.escapeHTML(p.name)}</h4>
                        <p>${this.escapeHTML(p.title || 'Polis Memuru')}</p>
                        <p style="font-size:0.65rem; color:var(--text-muted);">${this.escapeHTML(p.department || 'Birim Yok')}</p>
                    </div>
                    <span class="material-symbols-outlined p-item-arrow">chevron_right</span>
                </div>
            `;
        });
        
        if (filtered.length > 50) {
            html += `<div style="text-align:center; padding:10px; font-size:0.75rem; color:var(--text-muted);">... ve ${filtered.length - 50} personel daha. Aramayı daraltın.</div>`;
        }

        container.innerHTML = html;
    },

    openPersonnelDetails(sicil) {
        const p = this.state.personnel.find(item => item.sicil === sicil);
        if (!p) return;

        const photoSrc = (this.state.photoCache && this.state.photoCache[p.sicil]) ? this.state.photoCache[p.sicil] : (window.location.protocol !== 'file:' ? `/api/photo?sicil=${p.sicil}` : 'polislogo.png');
        const contentHtml = `
            <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; margin-bottom:15px; border-bottom:1px solid var(--glass-border); padding-bottom:15px;">
                <img src="${photoSrc}" class="p-details-photo">
                <div>
                    <h4 style="font-size:1rem; font-weight:700;">${this.escapeHTML(p.name)}</h4>
                    <p style="font-size:0.75rem; color:var(--text-secondary);">${this.escapeHTML(p.title || '')}</p>
                    <span class="role-badge" style="margin-top:3px;">${this.escapeHTML(p.department || '')}</span>
                </div>
            </div>

            <!-- MOBİL HIZLI İLETİŞİM EYLEMLERİ -->
            <div style="display:flex; justify-content:center; gap:24px; margin-bottom:15px; border-bottom:1px solid var(--glass-border); padding-bottom:15px; width:100%;">
                ${p.phone ? `
                <a href="tel:${p.phone}" class="quick-action-btn" title="Ara">
                    <span class="material-symbols-outlined">call</span>
                    <span style="font-size: 0.65rem; font-weight:600; margin-top:2px;">Ara</span>
                </a>
                <a href="sms:${p.phone}" class="quick-action-btn" title="Mesaj Gönder">
                    <span class="material-symbols-outlined">sms</span>
                    <span style="font-size: 0.65rem; font-weight:600; margin-top:2px;">SMS</span>
                </a>
                ` : ''}
                ${p.email ? `
                <a href="mailto:${p.email}" class="quick-action-btn" title="E-Posta Gönder">
                    <span class="material-symbols-outlined">mail</span>
                    <span style="font-size: 0.65rem; font-weight:600; margin-top:2px;">E-Posta</span>
                </a>
                ` : ''}
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px; font-size:0.8rem;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Sicil Numarası</span>
                    <strong>${p.sicil || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">T.C. Kimlik No</span>
                    <strong>${p.tcno || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Dahili Hat</span>
                    <strong>${p.dahili || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Cep Telefonu</span>
                    <strong>${p.phone || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Kurumsal E-Posta</span>
                    <strong>${p.email || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Kan Grubu</span>
                    <strong>${p.kan || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Doğum Yeri / Tarihi</span>
                    <strong>${(p.dogumtarihi || '') + ((p.dogumtarihi && p.dogumyeri) ? ' / ' : '') + (p.dogumyeri || '') || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Nüfus Kayıt İl</span>
                    <strong>${p.nufusili || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Medeni Hali</span>
                    <strong>${p.medenihali || '-'}</strong>
                </div>
                ${(p.medenihali === 'Evli' || p.evliliktarihi) ? `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Evlilik Tarihi</span>
                    <strong>${p.evliliktarihi || '-'}</strong>
                </div>
                ` : ''}
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Tahsil / Öğrenim</span>
                    <strong>${p.tahsili || '-'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
                    <span style="color:var(--text-muted);">Ev Adresi</span>
                    <strong style="text-align:right; font-size:0.75rem; max-width:60%;">${p.adres || '-'}</strong>
                </div>
            </div>
        `;

        document.getElementById('bs-title').textContent = "Personel Kartı Detayı";
        document.getElementById('bottom-sheet-body-content').innerHTML = contentHtml;
        this.openBottomSheet();
    },

    // --- HAFTA SONU & GÖREV KAYDI ---
    populateDutyPersonnelSelect() {
        const select = document.getElementById('duty-form-personnel');
        if (!select) return;

        const firstOption = select.options[0];
        select.innerHTML = '';
        select.appendChild(firstOption);

        const filtered = this.state.personnel.filter(p => p.department && p.department.trim() === 'Stratejik Yönetim Şube Müdürlüğü');
        const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

        sorted.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.sicil;
            opt.textContent = `${p.name} (${p.sicil})`;
            select.appendChild(opt);
        });
    },

    renderDutyRegistry() {
        const container = document.getElementById('duty-list-container');
        if (!container) return;

        const dutyStatTotal = document.getElementById('duty-stat-total');
        if (dutyStatTotal) {
            dutyStatTotal.textContent = this.state.dutyRegistry.length;
        }

        if (this.state.dutyRegistry.length === 0) {
            container.innerHTML = '<div class="loading-placeholder">Çevrimdışı kayıt bulunmamaktadır.</div>';
            return;
        }

        const sortedRegistry = [...this.state.dutyRegistry].sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = '';
        sortedRegistry.forEach(item => {
            const dateStr = this.formatTurkishDate(item.date);
            const badgeClass = item.type === 'Mesai' ? 'badge-mesai' : 'badge-goreg';
            const typeText = item.type === 'Mesai' ? 'H.Sonu Mesaisi' : 'Dış Görev';

            html += `
                <div class="glass-card duty-item-card">
                    <div class="duty-info">
                        <h4>${this.escapeHTML(item.name)} <span class="duty-badge ${badgeClass}">${typeText}</span></h4>
                        <p>${dateStr} | Süre: <strong>${item.duration} Gün</strong></p>
                        <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Açıklama: ${this.escapeHTML(item.desc || '-')}</p>
                    </div>
                    <button class="icon-btn" onclick="App.deleteDutyRecordOffline('${item.id}')" style="color:var(--color-danger);" title="Sil">
                        <span class="material-symbols-outlined" style="font-size:1.2rem;">delete</span>
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    saveDutyRecord() {
        const select = document.getElementById('duty-form-personnel');
        const dateInput = document.getElementById('duty-form-date');
        const durationInput = document.getElementById('duty-form-duration');
        const typeSelect = document.getElementById('duty-form-type');
        const descInput = document.getElementById('duty-form-description');

        const sicil = select.value;
        const date = dateInput.value;
        const duration = parseInt(durationInput.value);
        const type = typeSelect.value;
        const desc = descInput.value.trim();

        if (!sicil || !date || isNaN(duration) || duration < 1) {
            this.showToast("Lütfen tüm alanları doldurun.", "error");
            return;
        }

        const person = this.state.personnel.find(p => p.sicil === sicil);
        const name = person ? person.name : 'Bilinmeyen Personel';

        const newRecord = {
            id: '_' + Math.random().toString(36).substr(2, 9),
            sicil: sicil,
            name: name,
            date: date,
            duration: duration,
            type: type,
            desc: desc
        };

        this.state.dutyRegistry.push(newRecord);
        this.addLog("DUTY_ADD", `"${name}" personeli için "${type}" kaydı oluşturuldu.`);
        this.saveDatabase();
        this.renderDutyRegistry();
        this.showToast("Kayıt başarıyla kaydedildi.", "success");

        // Formu sıfırla
        select.value = '';
        dateInput.value = '';
        durationInput.value = '1';
        descInput.value = '';
    },

    async deleteDutyRecordOffline(id) {
        if (await CustomDialog.confirm("Kayıt Silinecek", "Bu görev kaydını silmek istediğinize emin misiniz?", { type: 'danger', icon: 'delete', okText: 'Sil', cancelText: 'İptal' })) {
            const idx = this.state.dutyRegistry.findIndex(item => item.id === id);
            if (idx !== -1) {
                const item = this.state.dutyRegistry[idx];
                this.state.dutyRegistry.splice(idx, 1);
                this.addLog("DUTY_DELETE", `"${item.name}" personeline ait "${item.type}" kaydı silindi.`);
                this.saveDatabase();
                this.renderDutyRegistry();
                this.showToast("Kayıt silindi.", "success");
            }
        }
    },

    // --- YÖNETİCİ PANELİ ---
    renderAdminPanel() {
        const pendingContainer = document.getElementById('admin-pending-list');
        if (pendingContainer) {
            // Çevrimdışı modda onay bekleyen kullanıcılar yoktur
            pendingContainer.innerHTML = '<div class="loading-placeholder">Tüm kullanıcı onayları aktif durumdadır.</div>';
        }

        const logsContainer = document.getElementById('admin-logs-list');
        if (logsContainer) {
            const sortedLogs = [...this.state.logs].reverse();
            let html = '';
            sortedLogs.forEach(log => {
                let logColor = 'var(--text-secondary)';
                if (log.event_type.includes('FAIL') || log.event_type.includes('DELETE')) {
                    logColor = 'var(--color-danger)';
                } else if (log.event_type.includes('ADD') || log.event_type.includes('INIT')) {
                    logColor = 'var(--color-success)';
                }

                html += `
                    <div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.02); font-size:0.7rem; line-height:1.3;">
                        <div style="display:flex; justify-content:between; font-weight:600; color:${logColor};">
                            <span>[${log.event_type}]</span>
                            <span style="margin-left:auto; color:var(--text-muted); font-size:0.65rem;">${log.timestamp || ''}</span>
                        </div>
                        <div style="color:var(--text-primary); margin-top:2px;">${this.escapeHTML(log.details)}</div>
                    </div>
                `;
            });
            logsContainer.innerHTML = html;
        }
    },

    // --- AYARLAR VE VERİTABANI RESETLEME ---
    openSettingsModal() {
        document.getElementById('settings-modal').style.display = 'flex';
        
        // Settings modalını çevrimdışı panel şeklinde göster
        const header = document.querySelector('#settings-modal h3');
        if (header) header.textContent = "Uygulama Bilgi & Çevrimdışı Veri";

        const body = document.querySelector('#settings-modal .modal-body');
        if (body) {
            const photoCount = Object.keys(this.state.photoCache || {}).length;
            body.innerHTML = `
                <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">Yüklenen Personel Sayısı:</span>
                        <strong>${this.state.personnel.length} Kişi</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">Yüklenen Fotoğraf Sayısı:</span>
                        <strong>${photoCount} Adet</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">Toplam Görev Sayısı:</span>
                        <strong>${this.state.tasks.length} Görev</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">H.Sonu/Görev Kayıtları:</span>
                        <strong>${this.state.dutyRegistry.length} Kayıt</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">Veri Depolama Türü:</span>
                        <strong style="color:var(--color-success);">Telefona Gömülü (Secure Storage)</strong>
                    </div>
                </div>
                
                <div style="border-top:1px solid var(--glass-border); padding-top:12px; margin-top:12px; display:flex; flex-direction:column; gap:8px;">
                    <strong style="font-size:0.8rem; display:block;">Veri İçe Aktar (İnternetsiz):</strong>
                    
                    <label class="btn btn-secondary btn-block" style="cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; margin:0; padding:8px 0; font-size:0.75rem;">
                        <span class="material-symbols-outlined" style="font-size:1.1rem;">upload_file</span>
                        Veri Dosyası Yükle (.json)
                        <input type="file" id="import-json-input" accept=".json" style="display:none;" onchange="App.handleJSONImport(event)">
                    </label>
                    
                    <label class="btn btn-secondary btn-block" style="cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; margin:0; padding:8px 0; font-size:0.75rem;">
                        <span class="material-symbols-outlined" style="font-size:1.1rem;">photo_library</span>
                        Fotoğrafları Yükle (Toplu Seç)
                        <input type="file" id="import-photos-input" accept="image/png, image/jpeg" multiple style="display:none;" onchange="App.handlePhotosImport(event)">
                    </label>
                </div>
                
                <div style="border-top:1px solid var(--glass-border); padding-top:12px; margin-top:12px;">
                    <p style="font-size:0.6rem; color:var(--color-danger); margin-bottom:8px; font-weight:600; line-height:1.3;">Dikkat: Sıfırlamak eklediğiniz tüm özel görev, mesai ve fotoğrafları siler ve ilk yükleme durumuna döndürür.</p>
                    <button id="btn-reset-db" class="btn btn-danger btn-block" style="padding:8px 0; font-size:0.75rem;" onclick="App.resetDatabaseToDefault()">Tüm Verileri Sıfırla</button>
                </div>
            `;
        }
    },

    closeSettingsModal() {
        document.getElementById('settings-modal').style.display = 'none';
    },

    async resetDatabaseToDefault() {
        if (await CustomDialog.confirm("Verileri Sıfırla", "Tüm veri tabanını ve fotoğrafları sıfırlamak istediğinize emin misiniz? Bu işlem geri alınamaz.", { type: 'danger', icon: 'delete_forever', okText: 'Sıfırla', cancelText: 'Vazgeç' })) {
            localStorage.removeItem('off_currentUser');
            localStorage.removeItem('off_personnel');
            localStorage.removeItem('off_tasks');
            localStorage.removeItem('off_duties');
            localStorage.removeItem('off_logs');
            
            // Clear IndexedDB photos
            try {
                const db = await openDB();
                const tx = db.transaction("photos", "readwrite");
                tx.objectStore("photos").clear();
                tx.oncomplete = () => {
                    this.showToast("Veri tabanı ve fotoğraflar sıfırlandı.", "success");
                    setTimeout(() => window.location.reload(), 1000);
                };
            } catch (e) {
                console.error("Fotoğraflar temizlenemedi:", e);
                window.location.reload();
            }
        }
    },

    // --- ENTEGRE FOTOĞRAF VE VERİ YÜKLEME METODLARI ---
    async loadPhotoCache() {
        try {
            const db = await openDB();
            const tx = db.transaction("photos", "readonly");
            const store = tx.objectStore("photos");
            const request = store.openCursor();
            this.state.photoCache = {};
            return new Promise((resolve) => {
                request.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        this.state.photoCache[cursor.key] = cursor.value;
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            });
        } catch (e) {
            console.error("Fotoğraf önbelleği yüklenemedi:", e);
        }
    },

    handleJSONImport(event) {
        const file = event.target.files[0];
        if (file) {
            this.importJSONData(file);
        }
    },

    handlePhotosImport(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            this.importPhotos(files);
        }
    },

    async importJSONData(file) {
        try {
            const text = await this.readFileAsText(file);
            const data = JSON.parse(text);
            
            if (data.personnel) {
                this.state.personnel = data.personnel;
                localStorage.setItem('off_personnel', JSON.stringify(data.personnel));
            }
            if (data.tasks) {
                this.state.tasks = data.tasks;
                localStorage.setItem('off_tasks', JSON.stringify(data.tasks));
            }
            if (data.duties) {
                this.state.dutyRegistry = data.duties;
                localStorage.setItem('off_duties', JSON.stringify(data.duties));
            }
            
            // Eğer paket içerisinde fotoğraflar varsa otomatik olarak IndexedDB'ye aktar
            if (data.photos) {
                this.showToast("Fotoğraflar yerel hafızaya işleniyor...", "info");
                const db = await openDB();
                const tx = db.transaction("photos", "readwrite");
                const store = tx.objectStore("photos");
                
                store.clear(); // Eski fotoğrafları temizle
                
                for (const [sicil, base64Data] of Object.entries(data.photos)) {
                    store.put(base64Data, sicil);
                    this.state.photoCache[sicil] = base64Data;
                }
                
                tx.oncomplete = () => {
                    this.showToast("Veri tabanı ve fotoğraflar başarıyla yüklendi!", "success");
                    this.renderPersonnelList();
                    this.openSettingsModal(); // İstatistikleri güncelle
                };
            } else {
                this.showToast("Veri tabanı başarıyla güncellendi!", "success");
            }
            
            this.addLog("DATA_IMPORT", "Dışarıdan veri tabanı dosyası başarıyla yüklendi.");
            this.saveDatabase();
            
            this.renderDashboard();
            this.renderTasks();
            this.renderDutyRegistry();
            this.renderPersonnelList();
            this.openSettingsModal(); // İstatistikleri güncelle
        } catch (e) {
            this.showToast("Geçersiz veri formatı!", "error");
            console.error(e);
        }
    },

    async importPhotos(files) {
        let importedCount = 0;
        let errorCount = 0;
        this.showToast(`${files.length} fotoğraf işleniyor...`, "info");
        
        for (const file of files) {
            try {
                // Dosya adından sicil numarasını al (örn: "546131.png" veya "546131.jpg" -> "546131")
                const filename = file.name;
                const sicil = filename.split('.')[0];
                if (!sicil || isNaN(sicil)) {
                    errorCount++;
                    continue;
                }
                
                const base64Data = await this.readFileAsDataURL(file);
                await savePhoto(sicil, base64Data);
                this.state.photoCache[sicil] = base64Data;
                importedCount++;
            } catch (e) {
                errorCount++;
            }
        }
        
        this.showToast(`${importedCount} fotoğraf başarıyla yüklendi!`, "success");
        if (errorCount > 0) {
            console.warn(`${errorCount} dosya işlenemedi (geçersiz format/sicil).`);
        }
        this.renderPersonnelList();
        this.openSettingsModal(); // Refresh stats
    },

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e.target.error);
            reader.readAsText(file, "utf-8");
        });
    },

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e.target.error);
            reader.readAsDataURL(file);
        });
    },

    openBottomSheet() {
        document.getElementById('bottom-sheet').style.display = 'block';
    },

    closeBottomSheet() {
        document.getElementById('bottom-sheet').style.display = 'none';
    },

    // --- YARDIMCI METODLAR ---
    showToast(message, type = "info") {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    },

    formatTurkishDate(dateStr) {
        if (!dateStr) return '';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                return `${parts[2]}.${parts[1]}.${parts[0]}`;
            }
            return dateStr;
        } catch (e) {
            return dateStr;
        }
    }
};

// Sayfa Yüklendiğinde Başlat
window.addEventListener('DOMContentLoaded', () => {
    App.init();
});
