/**
 * Stratejik Yönetim Portal - Ana Arayüz ve Uygulama Mantığı
 * Polling döngüsünü, sayfa yönlendirmelerini ve dinamik şablonları yönetir.
 */

const App = {
    // Uygulama Durum Deposu (State)
    state: {
        currentUser: null,      // {session_id, computer_name, ip, role, status}
        tasks: [],              // Kanban görevleri listesi
        messages: [],           // Sohbet mesajları listesi
        onlineUsers: {},        // Çevrimiçi kullanıcı listesi
        personnel: [],          // Yetki onaylı personel listesi
        personnelCurrentPage: 1,
        personnelPerPage: 25,
        updateCounter: 0,       // Sunucu versiyon takibi
        activeTab: 'tab-dashboard',
        isAdminAuthenticated: false,
        soundNotification: true,
        taskFilters: { search: '' },
        editModeActive: false,
        currentChatUser: 'global',
        seenMessageIds: new Set(), // Bildirimi gösterilmiş mesaj IDleri
        dutyRegistry: [],
        deferredPrompt: null
    },

    // Polling Interval referansı
    pollingInterval: null,

    // Uygulama Başlangıç Metodu
    async init() {
        console.log("Portal başlatılıyor...");
        
        // 1. Kanban Sürükle-Bırak mekanizmasını başlat
        KanbanBoard.init();
        
        // 2. Tema ayarını yükle
        this.initTheme();

        // PWA (Progressive Web App) altyapısını başlat
        this.initPWA();

        // 3. Olay dinleyicileri (Button clicks, inputs vb.) bağla
        this.bindEvents();

        // 4. İstemci bilgilerini çöz ve polling döngüsünü başlat
        try {
            await this.identifyUser();
            this.startPolling();
            this.showToast("Bağlantı kuruldu.", "info");
        } catch (error) {
            this.showToast("Sunucuyla bağlantı kurulamadı: " + error.message, "error");
        }
    },

    // Tema Yönetimi
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    },

    // PWA (Kurulabilir Uygulama) Ayarları
    initPWA() {
        // Eski Service Worker'ları Temizle (Önbellek sorunlarını önlemek için kaldırıldı)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.unregister().then(success => {
                        if (success) {
                            console.log('Aktif Service Worker başarıyla kaldırıldı.');
                        }
                    });
                }
            });
        }

        // Kurulum İstemini Yakalama
        window.addEventListener('beforeinstallprompt', (e) => {
            // Tarayıcının varsayılan kurulum balonunu engelle
            e.preventDefault();
            // İstemi sakla
            this.state.deferredPrompt = e;
            
            // Kurulum butonunu göster
            const installBtn = document.getElementById('btn-pwa-install');
            if (installBtn) {
                installBtn.style.display = 'inline-flex';
            }
        });

        // Kurulum Tamamlandığında
        window.addEventListener('appinstalled', (e) => {
            console.log('Uygulama başarıyla ana ekrana kuruldu.');
            this.state.deferredPrompt = null;
            
            // Kurulum butonunu gizle
            const installBtn = document.getElementById('btn-pwa-install');
            if (installBtn) {
                installBtn.style.display = 'none';
            }
            this.showToast("Uygulama başarıyla cihazınıza kuruldu!", "success");
        });
    },

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
        this.showToast(`Tema değiştirildi: ${newTheme === 'dark' ? 'Koyu' : 'Açık'}`, "info");
    },

    updateThemeIcon(theme) {
        const iconSpan = document.getElementById('theme-icon');
        if (iconSpan) {
            iconSpan.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
        }
    },

    // Kullanıcı Tanımlama
    async identifyUser() {
        const data = await APIClient.identify();
        this.state.currentUser = data;

        // Arayüzü kullanıcı bilgileriyle güncelle
        document.getElementById('user-computer-name').textContent = data.display_name || data.computer_name;
        document.getElementById('profile-ip').textContent = data.ip;
        document.getElementById('profile-computer-name').textContent = `${data.computer_name} (${data.display_name || data.computer_name})`;
        
        // Durum seçiciyi ayarla
        document.getElementById('user-status-select').value = data.status;

        this.state.isAdminAuthenticated = data.is_admin;
        this.updateAdminView(data.is_admin);
        this.updateRoleBadge(data.role);
    },

    updateRoleBadge(role) {
        const badge = document.getElementById('user-role-badge');
        const profileBadge = document.getElementById('profile-role');
        
        if (badge && profileBadge) {
            badge.textContent = role;
            profileBadge.textContent = role;
            
            // Eski sınıfları temizle
            badge.className = 'user-role';
            profileBadge.className = 'value badge-role';
            
            let classToAdd = 'role-unauthorized';
            if (role === 'Yönetici') classToAdd = 'role-admin';
            else if (role === 'Yetkili') classToAdd = 'role-editor';
            
            badge.classList.add(classToAdd);
            profileBadge.classList.add(classToAdd);
        }

        // Yetkilendirme durumuna göre görünümleri kilitle/aç
        this.handlePermissionsUI(role);
    },

    // Yetkiye Göre Arayüzü Şekillendirme (GÜVENLİK)
    handlePermissionsUI(role) {
        const lockOverlay = document.getElementById('access-lock-overlay');
        const lockIcon = document.getElementById('lock-icon');
        const lockTitle = document.getElementById('lock-title');
        const lockMessage = document.getElementById('lock-message');
        if (lockOverlay) lockOverlay.style.display = 'none';

        const personnelTabBtn = document.getElementById('tab-btn-personnel');
        const adminTabBtn = document.getElementById('tab-btn-admin');
        const dutyTabBtn = document.getElementById('tab-btn-duty');
        const onlyEditorAdminElements = document.querySelectorAll('.only-editor-admin');

        // Yönetici sekmesinin görünürlüğü: Yönetici ise veya admin oturumu açmışsa direkt görünsün
        if (adminTabBtn) {
            if (role === 'Yönetici' || this.state.isAdminAuthenticated) {
                adminTabBtn.style.display = 'inline-flex';
            } else {
                adminTabBtn.style.display = 'none';
            }
        }

        // Hafta Sonu & Görev sekmesinin görünürlüğü: Yönetici veya Yetkili ise görünsün
        if (dutyTabBtn) {
            if (role === 'Yönetici' || role === 'Yetkili') {
                dutyTabBtn.style.display = 'inline-flex';
            } else {
                dutyTabBtn.style.display = 'none';
            }
        }

        if (role === 'Misafir') {
            document.querySelectorAll('.tab-pane').forEach(el => {
                if (el.id !== 'tab-dashboard') el.innerHTML = '<div style="text-align:center; padding:50px; opacity:0.5;">Bu sekmeyi görüntüleme yetkiniz yok. Yönetici onayı gereklidir.</div>';
            });
        } else if (role === 'Yetkili' || role === 'Yönetici') {
            if (personnelTabBtn) personnelTabBtn.style.display = 'inline-flex';
            
            // Sadece yönetici (Admin) ise personel ekleme/düzenleme butonlarını göster
            const isAdmin = (role === 'Yönetici');
            onlyEditorAdminElements.forEach(el => {
                el.style.display = isAdmin ? 'inline-flex' : 'none';
            });
            
            // Personel listesini çek
            this.fetchPersonnelList();
        }
    },

    // Çevrimdışı ve Canlı veri güncelleme döngüsü
    startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        
        // İlk yükleme
        this.triggerImmediatePoll();

        // Her 1.5 saniyede bir hafif durum sorgusu
        this.pollingInterval = setInterval(async () => {
            try {
                const data = await APIClient.checkUpdates(this.state.updateCounter);
                if (data.updated) {
                    this.state.updateCounter = data.counter;
                    
                    // Rol değişikliği kontrolü (Sunucudan güncellenmiş olabilir)
                    if (data.role && data.role !== this.state.currentUser.role) {
                        this.showToast(`Yetkiniz güncellendi: ${data.role}`, "info");
                        this.state.currentUser.role = data.role;
                        this.updateRoleBadge(data.role);
                    }

                    // Admin yetkisi değişikliği kontrolü (Sunucudan güncellenmiş olabilir)
                    if (data.hasOwnProperty('is_admin') && data.is_admin !== this.state.isAdminAuthenticated) {
                        this.state.isAdminAuthenticated = data.is_admin;
                        this.updateAdminView(data.is_admin);
                    }
 
                    // Arayüz öğelerini güncelle
                    this.updateOnlineUsers(data.users);
                    this.updateDashboardRecentTasks(data.tasks);
                    
                    // Kanban panosu sürükleme kilidini kontrol et ve filtreleri uygula
                    this.renderFilteredTasks(data.tasks);
                    
                    this.updateChatFeeds(data.messages);
                    
                    // Bildirim kontrolü
                    this.checkForNewMessages(data.messages);

                    // İstatistikleri güncelle
                    this.state.tasks = data.tasks;
                    this.state.messages = data.messages;
                    this.updateAdminStats();

                    // Görev/Nöbet güncellemeleri
                    if (data.hasOwnProperty('duty_registry')) {
                        this.state.dutyRegistry = data.duty_registry || [];
                        if (this.state.activeTab === 'tab-duty') {
                            this.renderDutyRegistry();
                        }
                    }

                    // Yönetici Onay Popup ve Badge Kontrolü
                    if (data.pending_approvals) {
                        this.processPendingApprovals(data.pending_approvals);
                    }
                }
            } catch (err) {
                console.error("Poller güncelleme hatası:", err);
            }
        }, 1500);
    },

    async triggerImmediatePoll() {
        try {
            const data = await APIClient.checkUpdates(-1); // Zorla tüm veriyi çek
            this.state.updateCounter = data.counter;
            this.updateOnlineUsers(data.users);
            this.updateDashboardRecentTasks(data.tasks);
            this.renderFilteredTasks(data.tasks);
            this.state.tasks = data.tasks;
            this.updateChatFeeds(data.messages);
            
            // Bildirim kontrolü
            this.checkForNewMessages(data.messages, true);
            
            this.state.messages = data.messages;
            this.updateAdminStats();

            // Görev/Nöbet güncellemeleri
            if (data.hasOwnProperty('duty_registry')) {
                this.state.dutyRegistry = data.duty_registry || [];
                if (this.state.activeTab === 'tab-duty') {
                    this.renderDutyRegistry();
                }
            }

            // Yönetici Onay Popup ve Badge Kontrolü
            if (data.pending_approvals) {
                this.processPendingApprovals(data.pending_approvals);
            }

            // Rol ve Admin durumu güncellemesi
            if (data.role && data.role !== this.state.currentUser.role) {
                this.state.currentUser.role = data.role;
                this.updateRoleBadge(data.role);
            }
            if (data.hasOwnProperty('is_admin') && data.is_admin !== this.state.isAdminAuthenticated) {
                this.state.isAdminAuthenticated = data.is_admin;
                this.updateAdminView(data.is_admin);
            }
        } catch (err) {
            console.error("İlk poller hatası:", err);
        }
    },

    // Yeni gelen mesajları kontrol et ve bildirim modalı göster
    checkForNewMessages(newMessages, isInitial = false) {
        const myName = this.state.currentUser ? this.state.currentUser.computer_name : '';
        if (!myName) return;

        newMessages.forEach(msg => {
            // Kendi gönderdiğimiz mesajlar için bildirim gösterme
            if (msg.sender === myName) {
                this.state.seenMessageIds.add(msg.id);
                return;
            }
            // Bize ait olmayan veya genel sohbet mesajları için bildirim göster
            const isPrivateToMe = msg.recipient === myName;
            const isGlobal = msg.recipient === 'global';

            if ((isPrivateToMe || isGlobal) && !this.state.seenMessageIds.has(msg.id)) {
                this.state.seenMessageIds.add(msg.id);
                
                if (isInitial) return; // İlk yüklemede bildirim gösterme
                if (isGlobal) return;  // Genel sohbet mesajları için popup/ses bildirimi istemiyoruz
                
                // Eğer zaten bu kişiyle aktif sohbetteyse modal gösterme
                const isActiveChatOpen = this.state.activeTab === 'tab-chat' 
                    && (this.state.currentChatUser === msg.sender || (isGlobal && this.state.currentChatUser === 'global'));
                
                if (!isActiveChatOpen) {
                    const room = isPrivateToMe ? `🔒 Özel Mesaj` : `💬 Genel Sohbet`;
                    
                    // Gönderenin gerçek adını belirle
                    let displayName = msg.sender;
                    if (msg.sender_name) {
                        displayName = msg.sender_name;
                    } else if (this.state.onlineUsers[msg.sender] && this.state.onlineUsers[msg.sender].display_name) {
                        displayName = this.state.onlineUsers[msg.sender].display_name;
                    }
                    
                    // Sesli bildirim çal
                    if (this.state.soundNotification) {
                        this.playNotificationSound();
                    }

                    // Modal elementlerini güncelle ve göster
                    const overlay = document.getElementById('message-alert-overlay');
                    const previewText = document.getElementById('msg-alert-preview');
                    if (overlay && previewText) {
                        previewText.innerHTML = `<strong>Gönderen:</strong> <span style="color:var(--accent-primary); font-weight:bold;">${this.escapeHTML(displayName)}</span> (${room})<br><br><strong>Mesaj:</strong> ${this.escapeHTML(msg.text)}`;
                        overlay.style.display = 'flex';
                        
                        // "Sohbete Git" butonu eylemini ata
                        const goBtn = document.getElementById('btn-msg-alert-go');
                        if (goBtn) {
                            const newGoBtn = goBtn.cloneNode(true);
                            goBtn.replaceWith(newGoBtn);
                            newGoBtn.addEventListener('click', () => {
                                overlay.style.display = 'none';
                                this.switchTab('tab-chat');
                                if (isGlobal) {
                                    this.selectChatUser('global');
                                } else {
                                    this.selectChatUser(msg.sender);
                                }
                            });
                        }
                    }
                } else if (isPrivateToMe) {
                    // Aktif sohbet açıkken gelen mesajı sunucuda otomatik okundu işaretle
                    APIClient.request('/api/chat/mark_read', 'POST', { sender: msg.sender }).catch(e => console.error(e));
                }
            }
        });
    },

    // Olay Dinleyicileri Eşleştirme
    bindEvents() {
        // Sekme Değişiklikleri
        const tabButtons = document.querySelectorAll('.nav-tab');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // Tema seçici
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

        // PWA Kurulum Butonu
        const installBtn = document.getElementById('btn-pwa-install');
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                const promptEvent = this.state.deferredPrompt;
                if (!promptEvent) return;
                
                // Kurulum istemini göster
                promptEvent.prompt();
                
                // Kullanıcının yanıtını bekle
                const { outcome } = await promptEvent.userChoice;
                console.log(`PWA kurulum seçimi: ${outcome}`);
                
                // İstemi sıfırla
                this.state.deferredPrompt = null;
                
                // Kurulum butonunu gizle
                installBtn.style.display = 'none';
            });
        }

        // Durum değiştirici
        document.getElementById('user-status-select').addEventListener('change', async (e) => {
            const status = e.target.value;
            try {
                await APIClient.updateProfile(null, status);
                this.state.currentUser.status = status;
                this.showToast(`Durumunuz "${status}" olarak değiştirildi.`, "success");
                this.triggerImmediatePoll();
            } catch (err) {
                this.showToast(err.message, "error");
            }
        });

        // Hızlı sohbet mesaj gönderimi
        document.getElementById('quick-chat-send-btn').addEventListener('click', () => this.sendChatMessage('quick-chat-input'));
        document.getElementById('quick-chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage('quick-chat-input');
        });

        // Genel sohbet sayfa mesaj gönderimi
        document.getElementById('chat-message-send-btn').addEventListener('click', () => this.sendChatMessage('chat-message-input'));
        document.getElementById('chat-message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage('chat-message-input');
        });

        // --- DÜZENLEME MODU AKTİVASYONU ---
        const toggleEditBtn = document.getElementById('btn-toggle-edit-mode');
        if (toggleEditBtn) {
            toggleEditBtn.addEventListener('click', () => {
                this.state.editModeActive = !this.state.editModeActive;
                const board = document.querySelector('.kanban-board');
                if (this.state.editModeActive) {
                    toggleEditBtn.classList.add('btn-edit-active');
                    toggleEditBtn.innerHTML = '<span class="material-symbols-outlined">edit_off</span> Düzenlemeyi Kapat';
                    if (board) board.classList.add('edit-mode-active');
                    this.showToast("Düzenleme modu aktif. Görevleri düzenlemek veya silmek için kartlara tıklayın.", "info");
                } else {
                    toggleEditBtn.classList.remove('btn-edit-active');
                    toggleEditBtn.innerHTML = '<span class="material-symbols-outlined">edit</span> Düzenle';
                    if (board) board.classList.remove('edit-mode-active');
                    this.showToast("Düzenleme modu kapatıldı. Kartlara tıkladığınızda sadece detayları görürsünüz.", "info");
                }
            });
        }

        // --- GÖREV EKLEME/DÜZENLEME MODAL OLAYLARI ---
        document.getElementById('btn-create-task').addEventListener('click', () => this.openTaskModal());
        
        // Modal kapatma butonları
        const closeButtons = document.querySelectorAll('.close-modal-btn, .close-modal-action-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });

        // Görev Kaydet Düğmesi
        document.getElementById('btn-save-task-action').addEventListener('click', () => this.saveTask());

        // Görev Sil Düğmesi
        document.getElementById('btn-delete-task-modal').addEventListener('click', () => this.deleteTask());

        // Görev Yorum Gönder Düğmesi
        document.getElementById('btn-send-task-comment').addEventListener('click', () => this.addTaskComment());
        document.getElementById('input-new-task-comment').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTaskComment();
        });

        // --- PERSONEL PANEL OLAYLARI ---
        document.getElementById('btn-create-personnel').addEventListener('click', () => this.openPersonnelModal());
        document.getElementById('btn-save-personnel-action').addEventListener('click', () => this.savePersonnel());
        document.getElementById('btn-delete-personnel-modal').addEventListener('click', () => this.deletePersonnel());
        
        // Arama filtreleri
        document.getElementById('search-p-general').addEventListener('input', () => { this.state.personnelCurrentPage = 1; this.applyPersonnelFiltersAndRender(); });
        document.getElementById('search-p-dept').addEventListener('change', () => { this.state.personnelCurrentPage = 1; this.applyPersonnelFiltersAndRender(); });
        document.getElementById('search-p-rank').addEventListener('change', () => { this.state.personnelCurrentPage = 1; this.applyPersonnelFiltersAndRender(); });
        document.getElementById('btn-clear-p-filters').addEventListener('click', () => {
            document.getElementById('search-p-general').value = '';
            document.getElementById('search-p-dept').value = '';
            document.getElementById('search-p-rank').value = '';
            this.state.personnelCurrentPage = 1;
            this.applyPersonnelFiltersAndRender();
        });

        // --- GÖREV/KANBAN FILTRELERI ---
        const searchTGeneral = document.getElementById('search-t-general');
        const btnClearTFilters = document.getElementById('btn-clear-t-filters');

        if (searchTGeneral) {
            searchTGeneral.addEventListener('input', () => {
                this.state.taskFilters.search = searchTGeneral.value;
                this.renderFilteredTasks();
            });
        }
        if (btnClearTFilters) {
            btnClearTFilters.addEventListener('click', () => {
                if (searchTGeneral) searchTGeneral.value = '';
                this.state.taskFilters.search = '';
                this.renderFilteredTasks();
            });
        }

        // Mesaj bildirim modalı kapatma
        const alertCloseBtn = document.getElementById('btn-msg-alert-close');
        if (alertCloseBtn) {
            alertCloseBtn.addEventListener('click', () => {
                const overlay = document.getElementById('message-alert-overlay');
                if (overlay) overlay.style.display = 'none';
            });
        }

        // Excel/CSV aktarım butonu
        document.getElementById('btn-export-personnel').addEventListener('click', () => this.exportPersonnelToCSV());

        // --- YÖNETİCİ PANELİ OLAYLARI ---
        document.getElementById('admin-login-btn').addEventListener('click', () => this.adminLogin());
        document.getElementById('admin-password-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.adminLogin();
        });

        // Kilit Ekranı Yönetici Girişi
        const lockLoginBtn = document.getElementById('lock-admin-login-btn');
        const lockPwdInput = document.getElementById('lock-admin-password');
        
        if (lockLoginBtn && lockPwdInput) {
            const handleLockLogin = async () => {
                const pwd = lockPwdInput.value;
                if (!pwd) return;
                try {
                    const res = await APIClient.adminLogin(pwd);
                    this.state.isAdminAuthenticated = true;
                    lockPwdInput.value = '';
                    
                    // Kimliği yeniden çöz ve ekranı aç
                    await this.identifyUser();
                    this.showToast("Yönetici kilidi açıldı.", "success");
                    this.triggerImmediatePoll();
                } catch (err) {
                    this.showToast(err.message, "error");
                }
            };
            lockLoginBtn.addEventListener('click', handleLockLogin);
            lockPwdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleLockLogin();
            });
        }

        document.getElementById('admin-logout-btn').addEventListener('click', () => this.adminLogout());
        document.getElementById('btn-admin-change-password').addEventListener('click', () => this.changeAdminPassword());
        document.getElementById('btn-admin-export-db').addEventListener('click', () => this.exportOfflineDatabase());
        
        // Mesaj Arama
        document.getElementById('chat-message-search').addEventListener('input', (e) => this.filterMessages(e.target.value));

        // --- GİZLİ YÖNETİCİ AKTİVASYONU ---
        const headerLogo = document.querySelector('.header-logo');
        let logoClicks = 0;
        let logoClickTimeout;
        if (headerLogo) {
            headerLogo.addEventListener('click', () => {
                logoClicks++;
                clearTimeout(logoClickTimeout);
                if (logoClicks === 3) {
                    this.toggleAdminTabVisibility();
                    logoClicks = 0;
                } else {
                    logoClickTimeout = setTimeout(() => {
                        logoClicks = 0;
                    }, 400);
                }
            });
            headerLogo.style.cursor = 'pointer';
        }

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
                e.preventDefault();
                this.toggleAdminTabVisibility();
            }
        });

        // Developer tools (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U) engelleme
        document.addEventListener('keydown', (e) => {
            const isF12 = e.key === 'F12' || e.keyCode === 123;
            const isCtrlShiftI = e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'ı' || e.keyCode === 73);
            const isCtrlShiftJ = e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74);
            const isCtrlShiftC = e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67);
            const isCtrlU = e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85);

            if (isF12 || isCtrlShiftI || isCtrlShiftJ || isCtrlShiftC || isCtrlU) {
                e.preventDefault();
                this.showToast("Bu sayfa için kaynak koduna erişim engellenmiştir.", "error");
                return false;
            }
        });

        // Tarayıcı sağ tıkını engelleme ve özel sağ tık menüsünü yönetme
        const contextMenu = document.getElementById('custom-context-menu');
        const deleteContextBtn = document.getElementById('context-delete-btn');
        const taskEditContextBtn = document.getElementById('context-task-edit-btn');
        const taskDeleteContextBtn = document.getElementById('context-task-delete-btn');
        let activeDeletionTarget = null; // { type: 'chat'|'comment'|'task', id, sender, taskId }

        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // Menüyü sakla ve tüm seçenekleri gizle
            contextMenu.style.display = 'none';
            deleteContextBtn.style.display = 'none';
            if (taskEditContextBtn) taskEditContextBtn.style.display = 'none';
            if (taskDeleteContextBtn) taskDeleteContextBtn.style.display = 'none';
            activeDeletionTarget = null;

            // 1. Görev Kartı Sağ Tık Kontrolü
            const taskCard = e.target.closest('.task-card');
            if (taskCard) {
                const taskId = taskCard.getAttribute('data-id');
                const task = this.state.tasks.find(t => t.id === taskId);
                if (!task) return;

                // Silme/Düzenleme yetkisi kontrolü
                const isOwner = task.creator === this.state.currentUser.computer_name;
                const isAdmin = this.state.isAdminAuthenticated;

                activeDeletionTarget = { type: 'task', id: taskId, creator: task.creator };
                
                if (taskEditContextBtn) taskEditContextBtn.style.display = 'flex';
                if (taskDeleteContextBtn && (isAdmin || isOwner)) {
                    taskDeleteContextBtn.style.display = 'flex';
                }
                
                showContextMenu(e.clientX, e.clientY);
                return;
            }

            // 2. Sohbet Mesajı Balonu kontrolü
            const chatBubble = e.target.closest('.chat-message-bubble') || e.target.closest('.dash-msg-item');
            if (chatBubble) {
                const msgId = chatBubble.getAttribute('data-id');
                const sender = chatBubble.getAttribute('data-sender');
                if (!msgId) return;

                // Silme yetkisi kontrolü (Admin ise veya mesajın sahibi ise)
                const isOwner = sender === this.state.currentUser.computer_name;
                const isAdmin = this.state.isAdminAuthenticated;
                
                if (isAdmin || isOwner) {
                    activeDeletionTarget = { type: 'chat', id: msgId, sender: sender };
                    deleteContextBtn.style.display = 'flex';
                    showContextMenu(e.clientX, e.clientY);
                }
                return;
            }

            // 3. Görev Yorumu kontrolü
            const commentItem = e.target.closest('.comment-item');
            if (commentItem) {
                const commentId = commentItem.getAttribute('data-id');
                const user = commentItem.getAttribute('data-user');
                const taskId = document.getElementById('task-modal-id').value;
                if (!commentId || !taskId) return;

                // Silme yetkisi kontrolü (Admin ise veya yorumun sahibi ise)
                const isOwner = user === this.state.currentUser.computer_name;
                const isAdmin = this.state.isAdminAuthenticated;

                if (isAdmin || isOwner) {
                    activeDeletionTarget = { type: 'comment', id: commentId, sender: user, taskId: taskId };
                    deleteContextBtn.style.display = 'flex';
                    showContextMenu(e.clientX, e.clientY);
                }
                return;
            }
        });

        // Window resize event for personnel page size adjustment
        window.addEventListener('resize', () => {
            if (this.state.activeTab === 'tab-personnel') {
                this.applyPersonnelFiltersAndRender();
            }
        });

        // Tıklama ile menüyü kapatma
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#custom-context-menu')) {
                contextMenu.style.display = 'none';
            }
        });

        // Menü gösterme yardımcı metodu
        const showContextMenu = (x, y) => {
            contextMenu.style.display = 'block';
            
            // Pencere sınırlarını aşmamak için konum ayarlaması
            const menuWidth = contextMenu.offsetWidth || 140;
            const menuHeight = contextMenu.offsetHeight || 40;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            let posX = x;
            let posY = y;

            if (x + menuWidth > windowWidth) {
                posX = windowWidth - menuWidth - 10;
            }
            if (y + menuHeight > windowHeight) {
                posY = windowHeight - menuHeight - 10;
            }

            contextMenu.style.left = `${posX}px`;
            contextMenu.style.top = `${posY}px`;
        };

        // Silme düğmesi tıklama olayı (Mesajlar ve yorumlar için)
        deleteContextBtn.addEventListener('click', async () => {
            contextMenu.style.display = 'none';
            if (!activeDeletionTarget) return;

            const confirmMsg = activeDeletionTarget.type === 'chat' 
                ? 'Bu sohbet mesajını silmek istediğinize emin misiniz?' 
                : 'Bu görev yorumunu silmek istediğinize emin misiniz?';

            const confirmed = await this.showConfirmDialog("Silme Onayı", confirmMsg, "Sil", "İptal", "danger");
            if (!confirmed) return;

            try {
                if (activeDeletionTarget.type === 'chat') {
                    await APIClient.deleteChatMessage(activeDeletionTarget.id);
                    this.showToast("Mesaj silindi.", "success");
                    
                    // DOM'dan anında kaldır
                    const mainBubble = document.getElementById(`msg-main-${activeDeletionTarget.id}`);
                    if (mainBubble) {
                        if (mainBubble.parentElement && mainBubble.parentElement.classList.contains('chat-message-wrapper')) {
                            mainBubble.parentElement.remove();
                        } else {
                            mainBubble.remove();
                        }
                    }
                    const dashItem = document.getElementById(`msg-dash-${activeDeletionTarget.id}`);
                    if (dashItem) dashItem.remove();
                } else if (activeDeletionTarget.type === 'comment') {
                    await APIClient.deleteTaskComment(activeDeletionTarget.taskId, activeDeletionTarget.id);
                    this.showToast("Yorum silindi.", "success");
                    
                    // Görevin yorumlar dizisinden temizleyip yeniden çiz
                    const task = this.state.tasks.find(t => t.id === activeDeletionTarget.taskId);
                    if (task) {
                        task.comments = task.comments.filter(c => c.id !== activeDeletionTarget.id);
                        this.renderTaskComments(task.comments);
                    }
                }
                
                // Sunucuyla anında senkronize et
                this.triggerImmediatePoll();
            } catch (err) {
                this.showToast(err.message, "error");
            }
            
            activeDeletionTarget = null;
        });

        // Görev Düzenle menü tıklaması
        if (taskEditContextBtn) {
            taskEditContextBtn.addEventListener('click', () => {
                contextMenu.style.display = 'none';
                if (!activeDeletionTarget || activeDeletionTarget.type !== 'task') return;
                
                const task = this.state.tasks.find(t => t.id === activeDeletionTarget.id);
                if (task) {
                    const oldEditMode = this.state.editModeActive;
                    this.state.editModeActive = true;
                    this.openTaskModal(task);
                    this.state.editModeActive = oldEditMode;
                }
                activeDeletionTarget = null;
            });
        }

        // Görev Sil menü tıklaması
        if (taskDeleteContextBtn) {
            taskDeleteContextBtn.addEventListener('click', async () => {
                contextMenu.style.display = 'none';
                if (!activeDeletionTarget || activeDeletionTarget.type !== 'task') return;
                
                const confirmed = await this.showConfirmDialog("Görevi Sil", "Bu görevi tamamen silmek istediğinize emin misiniz?", "Evet, Sil", "İptal", "danger");
                if (!confirmed) return;
                
                try {
                    await APIClient.deleteTask(activeDeletionTarget.id);
                    this.showToast("Görev silindi.", "success");
                    this.triggerImmediatePoll();
                } catch (err) {
                    this.showToast(err.message, "error");
                }
                activeDeletionTarget = null;
            });
        }

        // --- HAFTA SONU & GÖREV KAYDI OLAYLARI ---
        const dutyForm = document.getElementById('duty-record-form');
        if (dutyForm) {
            dutyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveDutyRecord();
            });
        }

        const dutyFilterSearch = document.getElementById('duty-filter-search');
        const dutyFilterType = document.getElementById('duty-filter-type');
        const dutyFilterStart = document.getElementById('duty-filter-start-date');
        const dutyFilterEnd = document.getElementById('duty-filter-end-date');
        const btnClearDutyFilters = document.getElementById('btn-clear-duty-filters');
        const btnExportDuty = document.getElementById('btn-export-duty');

        if (dutyFilterSearch) {
            dutyFilterSearch.addEventListener('input', () => this.renderDutyRegistry());
        }
        if (dutyFilterType) {
            dutyFilterType.addEventListener('change', () => this.renderDutyRegistry());
        }
        if (dutyFilterStart) {
            dutyFilterStart.addEventListener('change', () => this.renderDutyRegistry());
        }
        if (dutyFilterEnd) {
            dutyFilterEnd.addEventListener('change', () => this.renderDutyRegistry());
        }

        if (btnClearDutyFilters) {
            btnClearDutyFilters.addEventListener('click', () => {
                if (dutyFilterSearch) dutyFilterSearch.value = '';
                if (dutyFilterType) dutyFilterType.value = '';
                if (dutyFilterStart) dutyFilterStart.value = '';
                if (dutyFilterEnd) dutyFilterEnd.value = '';
                this.renderDutyRegistry();
            });
        }

        if (btnExportDuty) {
            btnExportDuty.addEventListener('click', () => this.exportDutyToCSV());
        }

        // --- TARİH GİRİŞLERİNDE TIKLAMA İLE TAKVİMİ AÇMA ---
        const dateInputs = document.querySelectorAll('input[type="date"]');
        dateInputs.forEach(input => {
            input.addEventListener('click', () => {
                try {
                    if (typeof input.showPicker === 'function') {
                        input.showPicker();
                    }
                } catch (e) {
                    console.error("Takvim açma hatası:", e);
                }
            });
        });
    },

    // Sekme Değiştirme Mantığı
    switchTab(tabId) {
        this.state.activeTab = tabId;
        
        // Aktif buton görselini güncelle
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Aktif pencereyi göster
        const panes = document.querySelectorAll('.tab-pane');
        panes.forEach(pane => {
            if (pane.id === tabId) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });

        // Özel Sekme Yükleme Tetikleyicileri
        if (tabId === 'tab-personnel' && this.state.currentUser.role !== 'Misafir') {
            this.fetchPersonnelList();
        } else if (tabId === 'tab-tasks') {
            KanbanBoard.isFirstRender = true;
            this.renderFilteredTasks();
        } else if (tabId === 'tab-admin' && this.state.isAdminAuthenticated) {
            this.fetchAdminUsers();
        } else if (tabId === 'tab-chat' && this.state.currentChatUser && this.state.currentChatUser !== 'global') {
            // Sohbet sekmesine geçildiğinde, seçili olan özel sohbet odasını okunmuş yap
            APIClient.request('/api/chat/mark_read', 'POST', { sender: this.state.currentChatUser }).then(() => {
                this.triggerImmediatePoll();
            }).catch(e => console.error(e));
        } else if (tabId === 'tab-duty') {
            this.fetchPersonnelList().then(() => {
                this.populateDutyPersonnelSelect();
            });
            this.renderDutyRegistry();
        }

        // Mobil için yumuşak kaydırma
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // Yetki İsteme İstek Gönderimi (Devre Dışı Bırakıldı)
    async requestPermission(role) {
        return Promise.resolve();
    },

    // Sohbet Mesajı Gönderme Eylemi
    async sendChatMessage(inputId) {
        const input = document.getElementById(inputId);
        const text = input.value.trim();
        if (!text) return;

        try {
            // client.js eski sürümü önbellekte kalmış olabileceği için doğrudan request atıyoruz
            const recipientUser = this.state.currentChatUser || 'global';
            await APIClient.request('/api/chat/send', 'POST', { 
                text: text, 
                recipient: recipientUser 
            });
            input.value = '';
            // Polling tetikle
            this.triggerImmediatePoll();
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Aktif Kullanıcıları Arayüzde Listele
    updateOnlineUsers(users) {
        this.state.onlineUsers = users;
        const listContainer = document.getElementById('online-users-list');
        const chatUserList = document.getElementById('chat-users-list');
        if (!listContainer) return;

        let listHTML = '';
        let count = 0;

        // JS nesnesini diziye çevirip sırala
        const userEntries = Object.entries(users);
        const myName = this.state.currentUser ? this.state.currentUser.computer_name : '';

        // 1. Pano listesi için (sadece aktif olanlar)
        userEntries.forEach(([sid, user]) => {
            if (user.status !== 'Çevrimdışı') count++;

            let statusClass = 'active';
            if (user.status === 'Meşgul') statusClass = 'busy';
            else if (user.status === 'Dışarıda') statusClass = 'away';
            else if (user.status === 'Çevrimdışı') statusClass = 'offline';

            let roleBadgeClass = 'role-unauthorized';
            if (user.role === 'Yönetici') roleBadgeClass = 'role-admin';
            else if (user.role === 'Yetkili') roleBadgeClass = 'role-editor';

            const selfIndicator = sid === myName ? ' (Siz)' : '';

            if (user.status !== 'Çevrimdışı') {
                listHTML += `
                    <div class="user-card-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--glass-border); background: rgba(255, 255, 255, 0.01); margin-bottom: 8px;">
                        <div class="user-card-left" style="display: flex; align-items: center; gap: 10px;">
                            <div style="position: relative; width: 34px; height: 34px; flex-shrink: 0;">
                                <img src="/api/photo?sicil=${encodeURIComponent(sid)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzUyNTI1YiIgZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg=='" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--accent-primary); box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
                                <div class="status-dot ${statusClass}" style="position: absolute; bottom: -1px; right: -1px; border: 2px solid var(--bg-secondary); width: 10px; height: 10px; border-radius: 50%; z-index: 2;"></div>
                            </div>
                            <div class="user-card-info" style="display: flex; flex-direction: column;">
                                <span class="user-card-name" style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${this.escapeHTML(user.display_name || user.computer_name)}${selfIndicator}</span>
                                <span class="user-card-role badge-role ${roleBadgeClass}" style="margin-top:2px; font-size:0.6rem; align-self:flex-start; padding: 1px 5px;">${user.role}</span>
                            </div>
                        </div>
                        <span class="user-card-status-text ${statusClass}" style="font-size: 0.75rem; font-weight: 500;">${user.status}</span>
                    </div>
                `;
            }
        });

        // 2. Chat listesi için
        this.renderChatSidebar();

        const countEl = document.getElementById('online-users-count');
        if (countEl) countEl.textContent = count;
        const onlineBadge = document.getElementById('online-users-count-badge');
        if (onlineBadge) onlineBadge.textContent = count;
        listContainer.innerHTML = listHTML || '<p class="text-center" style="color:var(--text-muted)">Aktif kullanıcı yok.</p>';
    },

    // Yeni Chat Sidebar Render Metodu
    renderChatSidebar() {
        const chatUserList = document.getElementById('chat-users-list');
        if (!chatUserList) return;

        const myName = this.state.currentUser ? this.state.currentUser.computer_name : '';
        const users = this.state.onlineUsers || {};
        const messages = this.state.messages || [];

        // Okunmamış mesajları hesapla
        let unreadCounts = { 'global': 0 };
        let totalUnread = 0;
        messages.forEach(msg => {
            if (!msg.is_read) {
                if (msg.recipient === 'global' && msg.sender !== myName) {
                    // global için is_read tam çalışmıyor olabilir ama en azından track edilir.
                } else if (msg.recipient === myName) {
                    unreadCounts[msg.sender] = (unreadCounts[msg.sender] || 0) + 1;
                    totalUnread++;
                }
            }
        });

        // Global Nav Badge'i güncelle
        const navBadge = document.getElementById('nav-unread-badge');
        if (navBadge) {
            navBadge.textContent = totalUnread;
            navBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
        }

        let html = '';
        
        // 1. Genel Sohbet Kanalı
        const globalActive = this.state.currentChatUser === 'global' ? 'active-chat' : '';
        html += `
            <div class="chat-user-item ${globalActive}" onclick="App.selectChatUser('global')" style="display:flex; align-items:center; gap:10px; padding:10px 14px;">
                <div style="position: relative; width: 32px; height: 32px; flex-shrink: 0; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(220,38,38,0.1); border:1.5px solid var(--accent-primary);">
                    <span class="material-symbols-outlined" style="font-size:18px; color:var(--accent-primary);">groups</span>
                </div>
                <div class="chat-user-name" style="font-size:0.85rem; font-weight:600; flex-grow:1;">Genel Sohbet</div>
            </div>
        `;

        // Kullanıcıları Aktif ve Çevrimdışı olarak ayır
        let onlineArr = [];
        let offlineArr = [];
        Object.entries(users).forEach(([username, u]) => {
            if (username !== myName) {
                if (u.status !== 'Çevrimdışı') onlineArr.push(username);
                else offlineArr.push(username);
            }
        });

        // İsimlere göre sırala
        onlineArr.sort();
        offlineArr.sort();

        // 2. Çevrimiçi Kullanıcılar
        if (onlineArr.length > 0) {
            html += `<div style="font-size:0.75rem; color:var(--text-muted); margin: 10px 15px 5px 15px; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">Aktif Kullanıcılar</div>`;
            onlineArr.forEach(u => {
                const userObj = users[u] || {};
                const displayName = userObj.display_name || u;
                const isActive = this.state.currentChatUser === u ? 'active-chat' : '';
                const unread = unreadCounts[u] ? `<span class="unread-badge" style="position:static; margin-left:5px;">${unreadCounts[u]}</span>` : '';
                
                let statusClass = 'active';
                if (userObj.status === 'Meşgul') statusClass = 'busy';
                else if (userObj.status === 'Dışarıda') statusClass = 'away';
                
                html += `
                    <div class="chat-user-item ${isActive}" onclick="App.selectChatUser('${u}')" style="display:flex; align-items:center; gap:10px; padding:10px 14px;">
                        <div style="position: relative; width: 32px; height: 32px; flex-shrink: 0;">
                            <img src="/api/photo?sicil=${encodeURIComponent(u)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzUyNTI1YiIgZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg=='" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--accent-primary); box-shadow: 0 1px 4px rgba(0,0,0,0.15);">
                            <div class="status-dot ${statusClass}" style="position: absolute; bottom: -1px; right: -1px; border: 2px solid var(--bg-secondary); width: 8px; height: 8px; border-radius: 50%; z-index: 2;"></div>
                        </div>
                        <div class="chat-user-name" style="font-size:0.85rem; font-weight:600; flex-grow:1;">${this.escapeHTML(displayName)}</div>
                        ${unread}
                    </div>
                `;
            });
        }

        // 3. Çevrimdışı Kullanıcılar
        if (offlineArr.length > 0) {
            html += `<div style="font-size:0.75rem; color:var(--text-muted); margin: 10px 15px 5px 15px; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">Çevrimdışı</div>`;
            offlineArr.forEach(u => {
                const userObj = users[u] || {};
                const displayName = userObj.display_name || u;
                const isActive = this.state.currentChatUser === u ? 'active-chat' : '';
                const unread = unreadCounts[u] ? `<span class="unread-badge" style="position:static; margin-left:5px;">${unreadCounts[u]}</span>` : '';
                
                html += `
                    <div class="chat-user-item ${isActive}" onclick="App.selectChatUser('${u}')" style="display:flex; align-items:center; gap:10px; padding:10px 14px;">
                        <div style="position: relative; width: 32px; height: 32px; flex-shrink: 0;">
                            <img src="/api/photo?sicil=${encodeURIComponent(u)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzUyNTI1YiIgZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg=='" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--accent-primary); opacity: 0.6; box-shadow: 0 1px 4px rgba(0,0,0,0.15);">
                            <div class="status-dot offline" style="position: absolute; bottom: -1px; right: -1px; border: 2px solid var(--bg-secondary); width: 8px; height: 8px; border-radius: 50%; z-index: 2;"></div>
                        </div>
                        <div class="chat-user-name" style="font-size:0.85rem; font-weight:600; color:var(--text-muted); flex-grow:1;">${this.escapeHTML(displayName)}</div>
                        ${unread}
                    </div>
                `;
            });
        }

        chatUserList.innerHTML = html;
    },

    // Sohbet Edilecek Kişiyi Seçme
    selectChatUser(username) {
        this.state.currentChatUser = username;
        
        // Header bilgisini güncelle
        const titleEl = document.getElementById('chat-room-title');
        const descEl = document.getElementById('chat-room-desc');
        const iconEl = document.getElementById('chat-room-icon');
        
        const fallbackEl = document.getElementById('chat-room-avatar-fallback');
        const imgEl = document.getElementById('chat-room-avatar-img');

        if (username === 'global') {
            titleEl.textContent = 'Genel Sohbet Kanalı';
            descEl.textContent = 'Şube içi ortak mesajlaşma alanı';
            if (iconEl) iconEl.textContent = 'chat_bubble';
            if (fallbackEl) fallbackEl.style.display = 'flex';
            if (imgEl) imgEl.style.display = 'none';
        } else {
            const userObj = this.state.onlineUsers[username] || {};
            const displayName = userObj.display_name || username;
            titleEl.textContent = displayName;
            descEl.textContent = 'Özel Mesajlaşma (Uçtan Uca Gizli)';
            if (iconEl) iconEl.textContent = 'lock';
            
            if (fallbackEl && imgEl) {
                fallbackEl.style.display = 'none';
                imgEl.src = `/api/photo?sicil=${encodeURIComponent(username)}`;
                imgEl.style.display = 'block';
                imgEl.onerror = () => {
                    imgEl.style.display = 'none';
                    fallbackEl.style.display = 'flex';
                    if (iconEl) iconEl.textContent = 'person';
                };
            }
        }

        // Mesajları okunmuş olarak işaretle
        if (username !== 'global') {
            // client.js önbellekte kalmış olabileceği için doğrudan istek atıyoruz
            APIClient.request('/api/chat/mark_read', 'POST', { sender: username }).then(() => {
                this.triggerImmediatePoll();
            }).catch(e => console.error(e));
        }

        this.renderChatSidebar();
        this.updateChatFeeds(this.state.messages);
    },

    // Anasayfa sekmesindeki süresi gelen/aktif görevler kutusunu güncelle
    // Anasayfa sekmesindeki süresi gelen/aktif görevler kutusunu güncelle
    updateDashboardRecentTasks(tasks) {
        const container = document.getElementById('dashboard-recent-tasks');
        if (!container) return;

        // Süresi gelen (aktif) görevleri filtrele
        const isTaskOverdue = (task) => {
            if (task.status === 'done') return false;
            const dateStr = task.end_date || task.start_date;
            if (!dateStr) return false;
            
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;
            
            return todayStr > dateStr;
        };

        const isTaskActiveDue = (task) => {
            if (task.status === 'done') return false;
            if (!task.start_date && !task.end_date) return false;
            
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;
            
            const start = task.start_date || '';
            const end = task.end_date || '';
            
            if (start && end) {
                return todayStr >= start && todayStr <= end;
            } else if (start) {
                return todayStr >= start;
            } else if (end) {
                return todayStr <= end;
            }
            return false;
        };

        const getUpcomingTasks = (allTasks) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            return allTasks
                .filter(t => t.status !== 'done' && t.status !== 'in_progress' && !isTaskActiveDue(t) && !isTaskOverdue(t))
                .filter(t => t.end_date || t.start_date)
                .map(t => {
                    const dateStr = t.end_date || t.start_date;
                    const targetDate = new Date(dateStr);
                    targetDate.setHours(0, 0, 0, 0);
                    const diffTime = targetDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return { task: t, diffDays: diffDays };
                })
                .filter(item => item.diffDays >= 0)
                .sort((a, b) => a.diffDays - b.diffDays)
                .slice(0, 3)
                .map(item => item.task);
        };

        const safeTasks = tasks || [];
        const dueTasks = safeTasks.filter(t => isTaskActiveDue(t) || isTaskOverdue(t));
        const inProgressTasks = safeTasks.filter(t => t.status === 'in_progress');
        const upcomingTasks = getUpcomingTasks(safeTasks);

        let html = '';

        // 1. SÜRESİ GELENLER SEKTÖRÜ
        html += `
            <div style="font-size:0.75rem; color:var(--text-muted); margin: 0 0 10px 0; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:6px;">
                <span class="material-symbols-outlined" style="font-size:16px; color:var(--color-danger);">assignment_late</span> Süresi Gelen/Geçen Görevler
            </div>
        `;
        if (dueTasks.length > 0) {
            html += '<div class="list-container" style="margin-bottom: 15px;">';
            dueTasks.forEach(task => {
                const overdue = isTaskOverdue(task);
                const dotClass = overdue ? 'status-overdue' : 'status-due';
                const labelText = overdue ? 'Süresi Geçti' : 'Süresi Geldi';
                const bgStyle = overdue ? 'rgba(239, 68, 68, 0.05)' : 'rgba(220, 38, 38, 0.03)';
                const borderStyle = overdue ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(220, 38, 38, 0.2)';
                
                html += `
                    <div class="user-card-item active-due" style="cursor:pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; border-radius: var(--border-radius-sm); border: ${borderStyle}; background: ${bgStyle}; margin-bottom: 6px;" onclick="App.openTaskModalById('${task.id}')">
                        <div style="display:flex; align-items:center; gap:8px; width: 68%; overflow:hidden;">
                            <span class="task-status-dot ${dotClass}" title="${labelText}"></span>
                            <strong style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight: 500; color: ${overdue ? 'var(--color-danger)' : 'inherit'};">${this.escapeHTML(task.title)}</strong>
                        </div>
                        <span class="badge-role role-admin" style="font-size:0.65rem; padding: 2px 6px; flex-shrink: 0; background: var(--color-danger); color: white;">${labelText}</span>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += `
                <div style="border: 1px dashed var(--glass-border); border-radius: var(--border-radius-sm); padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.8rem; margin-bottom: 15px; background: rgba(255,255,255,0.01);">
                    <span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px; color: var(--text-muted);">check_circle</span> Süresi gelen aktif görev yok.
                </div>
            `;
        }

        html += '<div class="divider" style="margin: 12px 0;"></div>';

        // 2. YAPILMAKTA OLANLAR SEKTÖRÜ
        html += `
            <div style="font-size:0.75rem; color:var(--text-muted); margin: 0 0 10px 0; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:6px;">
                <span class="material-symbols-outlined" style="font-size:16px; color:var(--color-info);">sync</span> Yapılmakta Olan Görevler
            </div>
        `;
        if (inProgressTasks.length > 0) {
            html += '<div class="list-container" style="margin-bottom: 15px;">';
            inProgressTasks.forEach(task => {
                html += `
                    <div class="user-card-item" style="cursor:pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; border-radius: var(--border-radius-sm); border: 1px solid rgba(59, 130, 246, 0.2); background: rgba(59, 130, 246, 0.03); margin-bottom: 6px;" onclick="App.openTaskModalById('${task.id}')">
                        <div style="display:flex; align-items:center; gap:8px; width: 68%; overflow:hidden;">
                            <span class="task-status-dot" style="background-color: var(--color-info); box-shadow: 0 0 6px var(--color-info);" title="Yapılıyor"></span>
                            <strong style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight: 500;">${this.escapeHTML(task.title)}</strong>
                        </div>
                        <span class="badge-role role-editor" style="font-size:0.65rem; padding: 2px 6px; flex-shrink: 0; background: var(--color-info); color: white;">Yapılıyor</span>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += `
                <div style="border: 1px dashed var(--glass-border); border-radius: var(--border-radius-sm); padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.8rem; margin-bottom: 15px; background: rgba(255,255,255,0.01);">
                    <span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px; color: var(--text-muted);">hourglass_empty</span> Yapılmakta olan görev yok.
                </div>
            `;
        }

        html += '<div class="divider" style="margin: 12px 0;"></div>';

        // 3. YAKLAŞAN GÖREVLER SEKTÖRÜ
        html += `
            <div style="font-size:0.75rem; color:var(--text-muted); margin: 0 0 10px 0; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:6px;">
                <span class="material-symbols-outlined" style="font-size:16px; color:var(--color-warning);">schedule</span> Yaklaşan Görevler
            </div>
        `;
        if (upcomingTasks.length > 0) {
            html += '<div class="list-container">';
            upcomingTasks.forEach(task => {
                const dateStr = task.end_date || task.start_date;
                const d = new Date(dateStr);
                const today = new Date();
                today.setHours(0,0,0,0);
                d.setHours(0,0,0,0);
                const diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
                const badgeLabel = diffDays === 0 ? 'Bugün' : `${diffDays} Gün Kaldı`;

                html += `
                    <div class="user-card-item" style="cursor:pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; border-radius: var(--border-radius-sm); border: 1px solid var(--glass-border); background: rgba(255,255,255,0.01); margin-bottom: 6px;" onclick="App.openTaskModalById('${task.id}')">
                        <div style="display:flex; align-items:center; gap:8px; width: 68%; overflow:hidden;">
                            <span class="task-status-dot status-pending" title="Yaklaşıyor"></span>
                            <strong style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight: 500;">${this.escapeHTML(task.title)}</strong>
                        </div>
                        <span class="badge-role role-viewer" style="font-size:0.65rem; padding: 2px 6px; flex-shrink: 0; background: var(--color-success); color: white;">${badgeLabel}</span>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += `
                <div style="border: 1px dashed var(--glass-border); border-radius: var(--border-radius-sm); padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.8rem; background: rgba(255,255,255,0.01);">
                    <span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px; color: var(--text-muted);">upcoming</span> Yaklaşan görev bulunmamaktadır.
                </div>
            `;
        }

        container.innerHTML = html;
    },

    // Görev ID ile modal açma (Dashboard'dan tıklandığında)
    openTaskModalById(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (task) this.openTaskModal(task);
    },

    // Sohbet Mesajlarını Render Etme
    updateChatFeeds(messages) {
        const dashboardChat = document.getElementById('dashboard-chat-box');
        const mainChat = document.getElementById('chat-messages-body');
        
        if (!messages) return;

        const myName = this.state.currentUser ? this.state.currentUser.computer_name : '';
        const currentChatUser = this.state.currentChatUser || 'global';

        let mainChatMessages = [];
        if (currentChatUser === 'global') {
            mainChatMessages = messages.filter(m => m.recipient === 'global' || !m.recipient);
        } else {
            mainChatMessages = messages.filter(m => 
                (m.sender === myName && m.recipient === currentChatUser) || 
                (m.sender === currentChatUser && m.recipient === myName)
            );
        }
        
        let dashboardMessages = messages.filter(m => m.recipient === 'global' || !m.recipient);

        // 1. Temizleme (Reconciliation) - Sunucuda olmayan eski mesajları DOM'dan sil
        if (mainChat) {
            const existingWrappers = mainChat.querySelectorAll('.chat-message-wrapper');
            existingWrappers.forEach(wrapper => {
                const bubbleId = wrapper.id.replace('msg-main-wrap-', '');
                if (!mainChatMessages.some(m => m.id === bubbleId)) {
                    wrapper.remove();
                }
            });
        }

        if (dashboardChat) {
            const existingItems = dashboardChat.querySelectorAll('.dash-msg-item');
            existingItems.forEach(item => {
                const itemId = item.id.replace('msg-dash-', '');
                if (!dashboardMessages.some(m => m.id === itemId)) {
                    item.remove();
                }
            });
        }

        let hasNewMessage = false;

        // 2. Ekleme - Sadece yeni mesajları DOM'a ekle
        dashboardMessages.forEach(msg => {
            // Gönderenin gerçek adını belirle
            let displayName = msg.sender;
            if (msg.sender_name) {
                displayName = msg.sender_name;
            } else if (msg.sender === myName && this.state.currentUser && this.state.currentUser.display_name) {
                displayName = this.state.currentUser.display_name;
            } else if (this.state.onlineUsers[msg.sender] && this.state.onlineUsers[msg.sender].display_name) {
                displayName = this.state.onlineUsers[msg.sender].display_name;
            }
            
            // Pano Hızlı Sohbet Ekleme
            if (dashboardChat) {
                const dashId = `msg-dash-${msg.id}`;
                if (!document.getElementById(dashId)) {
                    hasNewMessage = true;
                    const dashboardMsgDiv = document.createElement('div');
                    dashboardMsgDiv.id = dashId;
                    dashboardMsgDiv.className = 'dash-msg-item';
                    dashboardMsgDiv.setAttribute('data-id', msg.id);
                    dashboardMsgDiv.setAttribute('data-sender', msg.sender);
                    dashboardMsgDiv.style.display = 'flex';
                    dashboardMsgDiv.style.alignItems = 'flex-start';
                    dashboardMsgDiv.style.gap = '8px';
                    dashboardMsgDiv.style.marginBottom = '8px';
                    dashboardMsgDiv.style.fontSize = '0.8rem';
                    dashboardMsgDiv.style.wordBreak = 'break-word';
                    dashboardMsgDiv.innerHTML = `
                        <div style="width: 24px; height: 24px; flex-shrink: 0; margin-top: 2px;">
                            <img src="/api/photo?sicil=${encodeURIComponent(msg.sender)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzUyNTI1YiIgZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg=='" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--accent-primary);">
                        </div>
                        <div style="flex-grow:1;">
                            <strong style="color:var(--accent-primary)"></strong>:
                            <span></span>
                            <span style="font-size:0.65rem; color:var(--text-muted); float:right; margin-left: 10px;">${msg.timestamp}</span>
                        </div>
                    `;
                    dashboardMsgDiv.querySelector('strong').textContent = displayName;
                    dashboardMsgDiv.querySelector('span').textContent = msg.text;
                    dashboardChat.appendChild(dashboardMsgDiv);
                    dashboardChat.scrollTop = dashboardChat.scrollHeight;
                }
            }
        });

        mainChatMessages.forEach(msg => {
            const isSelf = msg.sender === myName;
            const bubbleDirection = isSelf ? 'outgoing' : 'incoming';

            // Gönderenin gerçek adını belirle
            let displayName = msg.sender;
            if (msg.sender_name) {
                displayName = msg.sender_name;
            } else if (msg.sender === myName && this.state.currentUser && this.state.currentUser.display_name) {
                displayName = this.state.currentUser.display_name;
            } else if (this.state.onlineUsers[msg.sender] && this.state.onlineUsers[msg.sender].display_name) {
                displayName = this.state.onlineUsers[msg.sender].display_name;
            }

            // Ana Chat Sekmesi Ekleme
            if (mainChat) {
                const mainId = `msg-main-wrap-${msg.id}`;
                let bubbleWrap = document.getElementById(mainId);
                
                // Onay tikleri HTML'i (sadece bizim gönderdiğimiz ve genel sohbet olmayan özel mesajlar için)
                let ticksHTML = '';
                if (isSelf && msg.recipient && msg.recipient !== 'global') {
                    if (msg.status === 'read' || msg.is_read) {
                        ticksHTML = `<span class="material-symbols-outlined chat-tick read">done_all</span>`;
                    } else if (msg.status === 'delivered') {
                        ticksHTML = `<span class="material-symbols-outlined chat-tick delivered">done_all</span>`;
                    } else {
                        ticksHTML = `<span class="material-symbols-outlined chat-tick sent">done</span>`;
                    }
                }

                if (!bubbleWrap) {
                    hasNewMessage = true;
                    bubbleWrap = document.createElement('div');
                    bubbleWrap.id = mainId;
                    bubbleWrap.className = `chat-message-wrapper ${bubbleDirection}`;
                    bubbleWrap.style.display = 'flex';
                    bubbleWrap.style.alignItems = 'flex-end';
                    bubbleWrap.style.gap = isSelf ? '0px' : '8px';
                    bubbleWrap.style.width = '100%';
                    bubbleWrap.style.justifyContent = isSelf ? 'flex-end' : 'flex-start';
                    bubbleWrap.setAttribute('data-id', msg.id);
                    bubbleWrap.setAttribute('data-sender', msg.sender);

                    let avatarHTML = '';
                    if (!isSelf) {
                        avatarHTML = `
                            <div style="width: 26px; height: 26px; flex-shrink: 0; margin-bottom: 2px;">
                                <img src="/api/photo?sicil=${encodeURIComponent(msg.sender)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzUyNTI1YiIgZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg=='" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--accent-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.15);">
                            </div>
                        `;
                    }

                    bubbleWrap.innerHTML = `
                        ${avatarHTML}
                        <div class="chat-message-bubble ${bubbleDirection}" id="msg-main-${msg.id}" data-id="${msg.id}" data-sender="${msg.sender}" data-text="${this.escapeHTML(msg.text.toLowerCase())}" style="max-width:70%; margin-bottom: 0;">
                            <span class="msg-sender"></span>
                            <span class="msg-text"></span>
                            <div class="msg-meta">
                                <span class="msg-time">${msg.timestamp}</span>
                                <span class="msg-status-tick">${ticksHTML}</span>
                            </div>
                        </div>
                    `;
                    bubbleWrap.querySelector('.msg-sender').textContent = displayName;
                    bubbleWrap.querySelector('.msg-text').textContent = msg.text;
                    mainChat.appendChild(bubbleWrap);
                } else {
                    // Mesaj zaten varsa onay tikini güncelle
                    const tickSpan = bubbleWrap.querySelector('.msg-status-tick');
                    if (tickSpan) {
                        tickSpan.innerHTML = ticksHTML;
                    }
                }
            }
        });

        // Yeni bir mesaj geldiyse akışı en aşağı kaydır
        if (hasNewMessage) {
            if (dashboardChat) {
                dashboardChat.scrollTop = dashboardChat.scrollHeight;
            }
            if (mainChat) {
                mainChat.scrollTop = mainChat.scrollHeight;
            }
        }
    },

    // Mesaj Arama / Filtreleme
    filterMessages(query) {
        const bubbles = document.querySelectorAll('.chat-message-bubble');
        const search = query.trim().toLowerCase();
        
        bubbles.forEach(bubble => {
            const text = bubble.getAttribute('data-text');
            const targetEl = (bubble.parentElement && bubble.parentElement.classList.contains('chat-message-wrapper')) ? bubble.parentElement : bubble;
            if (text && text.includes(search)) {
                targetEl.style.display = 'flex';
            } else {
                targetEl.style.display = 'none';
            }
        });
    },

    // --- MODAL AÇMA / KAPATMA FONKSİYONLARI ---
    closeAllModals() {
        const tModal = document.getElementById('task-modal');
        const pModal = document.getElementById('personnel-modal');
        const pvModal = document.getElementById('personnel-view-modal');
        if (tModal) tModal.style.display = 'none';
        if (pModal) pModal.style.display = 'none';
        if (pvModal) pvModal.style.display = 'none';
    },

    // GÖREV MODALI (Detay Görünüm vs. Düzenleme Formu)
    openTaskModal(task = null) {
        this.closeAllModals();
        const modal = document.getElementById('task-modal');
        const titleEl = document.getElementById('task-modal-title');
        const idInput = document.getElementById('task-modal-id');
        
        const detailView = document.getElementById('task-modal-detail-view');
        const formView = document.getElementById('task-modal-form-view');
        const commentsSection = document.getElementById('task-comments-section');

        const titleInput = document.getElementById('task-title');
        const ebysNoInput = document.getElementById('task-ebys-no');
        const sourceBranchInput = document.getElementById('task-source-branch');
        const destinationInput = document.getElementById('task-destination');
        const coverLetterInput = document.getElementById('task-cover-letter');
        const startDateInput = document.getElementById('task-start-date');
        const endDateInput = document.getElementById('task-end-date');
        const recurrenceSelect = document.getElementById('task-recurrence');
        const deleteBtn = document.getElementById('btn-delete-task-modal');

        if (!modal || !detailView || !formView) return;

        if (task) {
            idInput.value = task.id;

            if (this.state.editModeActive) {
                // A. DÜZENLEME MODU (Form Görünümü)
                titleEl.textContent = 'Görevi Düzenle / Sil';
                detailView.style.display = 'none';
                formView.style.display = 'block';

                titleInput.value = task.title || '';
                ebysNoInput.value = task.ebys_no || '';
                sourceBranchInput.value = task.source_branch || '';
                destinationInput.value = task.destination || '';
                coverLetterInput.value = task.cover_letter || '';
                startDateInput.value = task.start_date || '';
                endDateInput.value = task.end_date || '';
                recurrenceSelect.value = task.recurrence || 'none';
                
                // Silme butonu yetkisi (Oluşturan veya Admin ise göster)
                const canDelete = (task.creator === this.state.currentUser.computer_name || this.state.currentUser.role === 'Yönetici');
                deleteBtn.style.display = canDelete ? 'inline-flex' : 'none';
            } else {
                // B. DETAY GÖRÜNTÜLEME MODU (Sadece Okuma Görünümü)
                titleEl.textContent = 'Görev İnceleme';
                formView.style.display = 'none';
                detailView.style.display = 'block';

                document.getElementById('task-detail-title').textContent = task.title || '';
                document.getElementById('task-detail-ebys-no').textContent = task.ebys_no || '-';
                document.getElementById('task-detail-source-branch').textContent = task.source_branch || '-';
                document.getElementById('task-detail-destination').textContent = task.destination || '-';
                
                const coverLetterBox = document.getElementById('task-detail-cover-letter');
                if (task.cover_letter && task.cover_letter.trim()) {
                    coverLetterBox.textContent = task.cover_letter;
                } else {
                    coverLetterBox.textContent = 'Üst yazı belirtilmemiş.';
                }

                // Öncelik rozeti gizlendi
                const pBadge = document.getElementById('task-detail-priority-badge');
                if(pBadge) pBadge.style.display = 'none';

                // Tarih aralığı rozeti
                const dateBadge = document.getElementById('task-detail-date-badge');
                const startStr = task.start_date ? task.start_date.split('-').reverse().join('.') : '';
                const endStr = task.end_date ? task.end_date.split('-').reverse().join('.') : '';
                let dateDisplay = '';
                if (startStr && endStr) {
                    dateDisplay = `${startStr} - ${endStr}`;
                } else if (startStr) {
                    dateDisplay = startStr;
                } else if (endStr) {
                    dateDisplay = endStr;
                } else {
                    dateDisplay = 'Tarih Belirtilmemiş';
                }
                dateBadge.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">calendar_month</span> ${dateDisplay}`;

                // Tekrarlama sıklığı rozeti
                const recBadge = document.getElementById('task-detail-recurrence-badge');
                if (task.recurrence && task.recurrence !== 'none') {
                    let recName = 'Haftalık';
                    if (task.recurrence === 'monthly') recName = 'Aylık';
                    else if (task.recurrence === '3_monthly') recName = '3 Ayda Bir';
                    else if (task.recurrence === '6_monthly') recName = '6 Ayda Bir';
                    else if (task.recurrence === 'yearly') recName = 'Yıllık';
                    recBadge.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">repeat</span> ${recName} Tekrar`;
                    recBadge.style.display = 'inline-flex';
                } else {
                    recBadge.style.display = 'none';
                }
            }

            // Yorumları Listele (Her iki modda da görünebilir)
            commentsSection.style.display = 'block';
            this.renderTaskComments(task.comments);
        } else {
            // C. YENİ GÖREV EKLEME MODU (Form Görünümü)
            titleEl.textContent = 'Yeni Görev Oluştur';
            idInput.value = '';
            detailView.style.display = 'none';
            formView.style.display = 'block';

            titleInput.value = '';
            ebysNoInput.value = '';
            sourceBranchInput.value = '';
            destinationInput.value = '';
            coverLetterInput.value = '';
            startDateInput.value = '';
            endDateInput.value = '';
            recurrenceSelect.value = 'none';
            deleteBtn.style.display = 'none';
            commentsSection.style.display = 'none';
        }

        modal.style.display = 'flex';
        
        // Üst yazı textarea boyutunu içeriğe göre ayarla
        setTimeout(() => {
            coverLetterInput.dispatchEvent(new Event('input'));
        }, 10);
    },

    // Görev Yorumlarını Ekrana Çiz
    renderTaskComments(comments) {
        const list = document.getElementById('task-comments-list');
        list.innerHTML = '';
        if (!comments || comments.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted); font-size:0.75rem; text-align:center;">Henüz yorum yapılmadı.</p>';
            return;
        }

        comments.forEach(comment => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            if (comment.id) {
                item.setAttribute('data-id', comment.id);
                item.setAttribute('data-user', comment.user);
            }
            const displayName = (this.state.onlineUsers[comment.user] && this.state.onlineUsers[comment.user].display_name) || comment.user;
            item.innerHTML = `
                <div class="comment-meta">
                    <span class="user"></span>
                    <span class="time">${comment.time}</span>
                </div>
                <div class="comment-text"></div>
            `;
            item.querySelector('.user').textContent = displayName;
            item.querySelector('.comment-text').textContent = comment.text;
            list.appendChild(item);
        });
        
        // En aşağı kaydır
        list.scrollTop = list.scrollHeight;
    },

    // Görev Kaydetme
    async saveTask() {
        const id = document.getElementById('task-modal-id').value;
        const title = document.getElementById('task-title').value.trim();
        const ebysNo = document.getElementById('task-ebys-no').value.trim();
        const sourceBranch = document.getElementById('task-source-branch').value.trim();
        const destination = document.getElementById('task-destination').value.trim();
        const coverLetter = document.getElementById('task-cover-letter').value.trim();
        const startDate = document.getElementById('task-start-date').value;
        const endDate = document.getElementById('task-end-date').value;
        const recurrence = document.getElementById('task-recurrence').value;

        if (!title) {
            this.showToast("Görev başlığı zorunludur.", "error");
            return;
        }

        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            this.showToast("Başlangıç tarihi bitiş tarihinden sonra olamaz.", "error");
            return;
        }

        const taskData = {
            title: title,
            ebys_no: ebysNo,
            source_branch: sourceBranch,
            destination: destination,
            cover_letter: coverLetter,
            start_date: startDate,
            end_date: endDate,
            recurrence: recurrence,
            priority: "Orta",
            assignee: ""
        };

        try {
            if (id) {
                // Güncelleme
                taskData.id = id;
                await APIClient.editTask(taskData);
                this.showToast("Görev güncellendi.", "success");
            } else {
                // Ekleme
                await APIClient.createTask(taskData);
                this.showToast("Görev başarıyla oluşturuldu.", "success");
            }
            this.closeAllModals();
            this.triggerImmediatePoll();
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Görev Silme
    async deleteTask() {
        const id = document.getElementById('task-modal-id').value;
        if (!id) return;

        const confirmed = await this.showConfirmDialog("Görevi Sil", "Bu görevi silmek istediğinize emin misiniz?", "Sil", "İptal", "danger");
        if (!confirmed) return;

        try {
            await APIClient.deleteTask(id);
            this.showToast("Görev silindi.", "success");
            this.closeAllModals();
            this.triggerImmediatePoll();
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Yorum Ekleme
    async addTaskComment() {
        const id = document.getElementById('task-modal-id').value;
        const input = document.getElementById('input-new-task-comment');
        const text = input.value.trim();

        if (!id || !text) return;

        try {
            const response = await APIClient.addTaskComment(id, text);
            input.value = '';
            
            // Görev listesini hafızada güncelle ve modalı yenile
            this.triggerImmediatePoll();
            
            // Polling'in gelmesini beklemeden yerel olarak ekle ve çiz (Hızlı geri bildirim)
            const task = this.state.tasks.find(t => t.id === id);
            if (task) {
                task.comments.push({
                    user: this.state.currentUser.computer_name,
                    text: text,
                    time: new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})
                });
                this.renderTaskComments(task.comments);
            }
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // --- PERSONEL METODLARI ---
    
    // Personel Verilerini Sunucudan Çek
    async fetchPersonnelList() {
        try {
            const data = await APIClient.getPersonnel();
            const isFirstLoad = !this.state.personnel || this.state.personnel.length === 0;
            const oldJSON = JSON.stringify(this.state.personnel);
            const newJSON = JSON.stringify(data);
            
            if (oldJSON !== newJSON || isFirstLoad) {
                this.state.personnel = data;
                this.populateDynamicPersonnelFilters();
                this.applyPersonnelFiltersAndRender();
                this.populateDutyPersonnelSelect();
            }
        } catch (err) {
            console.error("Personel bilgileri alınamadı:", err);
        }
    },

    // Dropdown filtre seçeneklerini dinamik doldurma
    populateDynamicPersonnelFilters() {
        const deptSelect = document.getElementById('search-p-dept');
        const rankSelect = document.getElementById('search-p-rank');
        if (!deptSelect || !rankSelect) return;

        const currentDept = deptSelect.value;
        const currentRank = rankSelect.value;

        const departments = new Set();
        const ranks = new Set();
        
        this.state.personnel.forEach(p => {
            if (p.department) departments.add(p.department.trim());
            if (p.title) ranks.add(p.title.trim());
        });

        const sortedDepts = Array.from(departments).sort((a, b) => a.localeCompare(b, 'tr'));
        const sortedRanks = Array.from(ranks).sort((a, b) => a.localeCompare(b, 'tr'));

        deptSelect.innerHTML = '<option value="">Tüm Birimler</option>' + sortedDepts.map(d => `<option value="${this.escapeHTML(d)}">${this.escapeHTML(d)}</option>`).join('');
        rankSelect.innerHTML = '<option value="">Tüm Rütbeler</option>' + sortedRanks.map(r => `<option value="${this.escapeHTML(r)}">${this.escapeHTML(r)}</option>`).join('');

        if (sortedDepts.includes(currentDept)) deptSelect.value = currentDept;
        if (sortedRanks.includes(currentRank)) rankSelect.value = currentRank;

        // İstatistik sayaçlarını güncelle
        this.updatePersonnelStats(sortedDepts.length, sortedRanks.length);
    },

    // İstatistik sayaçlarını güncelle (animasyonlu)
    updatePersonnelStats(deptCount, rankCount) {
        this.animateCounter('p-stat-total', this.state.personnel.length);
        this.animateCounter('p-stat-dept', deptCount);
        this.animateCounter('p-stat-rank', rankCount);
    },

    animateCounter(elementId, target) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const current = parseInt(el.textContent) || 0;
        if (current === target) return;
        
        const duration = 600;
        const start = performance.now();
        
        const step = (timestamp) => {
            const progress = Math.min((timestamp - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(current + (target - current) * eased);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    // Dinamik olarak sayfa başına personel sayısını hesaplama (ızgarayı tam dolduracak şekilde)
    updatePersonnelPerPage() {
        const container = document.getElementById('personnel-cards-container');
        if (!container) return;
        const width = container.offsetWidth;
        if (width === 0) {
            this.state.personnelPerPage = 25;
            return;
        }
        
        let cols = Math.floor((width + 14) / (230 + 14));
        if (cols < 1) cols = 1;
        if (cols > 5) cols = 5;
        
        let multiplier = Math.round(24 / cols);
        if (multiplier < 1) multiplier = 1;
        
        this.state.personnelPerPage = cols * multiplier;
    },


    // Filtreleri Uygulama ve Pagination ile Render Etme
    applyPersonnelFiltersAndRender() {
        this.updatePersonnelPerPage();
        const queryGeneral = document.getElementById('search-p-general').value.trim().toLowerCase();
        const queryDept = document.getElementById('search-p-dept').value;
        const queryRank = document.getElementById('search-p-rank').value;

        const filtered = this.state.personnel.filter(p => {
            const searchText = `${p.name} ${p.sicil} ${p.title} ${p.phone} ${p.email} ${p.tcno}`.toLowerCase();
            const matchesGeneral = queryGeneral === "" || searchText.includes(queryGeneral);
            const matchesDept = queryDept === "" || p.department === queryDept;
            const matchesRank = queryRank === "" || p.title === queryRank;
            return matchesGeneral && matchesDept && matchesRank;
        });

        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / this.state.personnelPerPage);
        
        if (this.state.personnelCurrentPage < 1) this.state.personnelCurrentPage = 1;
        if (totalPages > 0 && this.state.personnelCurrentPage > totalPages) {
            this.state.personnelCurrentPage = totalPages;
        }

        const startIndex = (this.state.personnelCurrentPage - 1) * this.state.personnelPerPage;
        const paginatedList = filtered.slice(startIndex, startIndex + this.state.personnelPerPage);

        // Gösterilen sayısını güncelle
        this.animateCounter('p-stat-filtered', totalItems);

        this.renderPersonnelCards(paginatedList);
        this.renderPagination(totalPages);
    },

    // Premium Pagination Butonları
    renderPagination(totalPages) {
        const container = document.getElementById('personnel-pagination');
        if (!container) return;
        
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }
        
        let html = '';
        
        const prevDisabled = this.state.personnelCurrentPage === 1 ? 'disabled' : '';
        html += `<button class="p-page-btn" ${prevDisabled} onclick="App.changePersonnelPage(${this.state.personnelCurrentPage - 1})"><span class="material-symbols-outlined">chevron_left</span></button>`;
        
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= this.state.personnelCurrentPage - 1 && i <= this.state.personnelCurrentPage + 1)) {
                const activeClass = i === this.state.personnelCurrentPage ? 'active' : '';
                html += `<button class="p-page-btn ${activeClass}" onclick="App.changePersonnelPage(${i})">${i}</button>`;
            } else if (i === this.state.personnelCurrentPage - 2 || i === this.state.personnelCurrentPage + 2) {
                html += `<span class="p-page-dots">···</span>`;
            }
        }
        
        const nextDisabled = this.state.personnelCurrentPage === totalPages ? 'disabled' : '';
        html += `<button class="p-page-btn" ${nextDisabled} onclick="App.changePersonnelPage(${this.state.personnelCurrentPage + 1})"><span class="material-symbols-outlined">chevron_right</span></button>`;
        
        container.innerHTML = html;
    },
    
    // Sayfa Değiştirme
    changePersonnelPage(page) {
        this.state.personnelCurrentPage = page;
        this.applyPersonnelFiltersAndRender();
        document.getElementById('personnel-authorized-view').scrollIntoView({ behavior: 'smooth' });
    },

    // Premium Personel Kartlarını Render Etme
    renderPersonnelCards(list) {
        const container = document.getElementById('personnel-cards-container');
        if (!container) return;

        if (!list || list.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px;">
                    <span class="material-symbols-outlined" style="font-size:3rem; color:var(--text-muted); opacity:0.4; margin-bottom:12px; display:block;">search_off</span>
                    <p style="color:var(--text-muted); font-size:0.9rem;">Aranan kriterlere uygun personel bulunamadı.</p>
                </div>`;
            return;
        }

        let html = '';
        list.forEach((p, index) => {
            const delay = index * 0.05;
            html += `
                <div class="personnel-card" style="animation-delay: ${delay}s;" onclick="App.openPersonnelViewModal('${p.sicil}')">
                    <div class="p-card-photo-wrapper">
                        <img src="/api/photo?sicil=${encodeURIComponent(p.sicil)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzUyNTI1YiIgZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg=='" alt="Fotoğraf" class="p-card-photo">
                    </div>
                    <img src="/api/rank?name=${encodeURIComponent(p.title)}" onerror="this.style.display='none'" alt="Rütbe" class="p-card-rank">
                    <h4 class="p-name">${this.escapeHTML(p.name)}</h4>
                    <span class="p-title-text">${this.escapeHTML(p.title || 'Unvan Belirtilmemiş')}</span>
                    <span class="p-dept-badge">${this.escapeHTML(p.department || 'Birim Belirtilmemiş')}</span>
                    <div class="p-card-info">
                        <div class="p-card-info-row">
                            <span class="p-label">Sicil</span>
                            <span class="p-value">${this.escapeHTML(p.sicil)}</span>
                        </div>
                        <div class="p-card-info-row">
                            <span class="p-label">Dahili</span>
                            <span class="p-value">${this.escapeHTML(p.dahili || '-')}</span>
                        </div>
                        <div class="p-card-info-row">
                            <span class="p-label">Cep</span>
                            <span class="p-value">${this.escapeHTML(p.phone || '-')}</span>
                        </div>
                        <div class="p-card-info-row email-row">
                            <span class="p-label">E-Posta</span>
                            <span class="p-value" title="${this.escapeHTML(p.email || '-')}">${this.escapeHTML(p.email || '-')}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    openPersonnelModalById(pId) {
        const p = this.state.personnel.find(item => item.id === pId);
        if (p) this.openPersonnelModal(p);
    },

    // Personel Modalı Açma
    openPersonnelModal(p = null) {
        this.closeAllModals();
        const modal = document.getElementById('personnel-modal');
        const titleEl = document.getElementById('personnel-modal-title');
        const idInput = document.getElementById('personnel-modal-id');
        const nameInput = document.getElementById('p-name');
        const titleInput = document.getElementById('p-title');
        const sicilInput = document.getElementById('p-sicil');
        const deptInput = document.getElementById('p-dept');
        const phoneInput = document.getElementById('p-phone');
        const emailInput = document.getElementById('p-email');
        const tcnoInput = document.getElementById('p-tcno');
        const dahiliInput = document.getElementById('p-dahili');
        const kanInput = document.getElementById('p-kan');
        const tahsiliInput = document.getElementById('p-tahsili');
        const dogumtarihiInput = document.getElementById('p-dogumtarihi');
        const dogumyeriInput = document.getElementById('p-dogumyeri');
        const nufusiliInput = document.getElementById('p-nufusili');
        const medenihaliInput = document.getElementById('p-medenihali');
        const evliliktarihiInput = document.getElementById('p-evliliktarihi');
        const adresInput = document.getElementById('p-adres');
        const deleteBtn = document.getElementById('btn-delete-personnel-modal');

        if (p) {
            titleEl.textContent = 'Personel Bilgilerini Düzenle';
            idInput.value = p.sicil;
            nameInput.value = p.name;
            titleInput.value = p.title || '';
            sicilInput.value = p.sicil;
            deptInput.value = p.department || '';
            phoneInput.value = p.phone || '';
            emailInput.value = p.email || '';
            tcnoInput.value = p.tcno || '';
            dahiliInput.value = p.dahili || '';
            kanInput.value = p.kan || '';
            tahsiliInput.value = p.tahsili || '';
            dogumtarihiInput.value = this.turkishToIsoDate(p.dogumtarihi);
            dogumyeriInput.value = p.dogumyeri || '';
            nufusiliInput.value = p.nufusili || '';
            medenihaliInput.value = p.medenihali || '';
            evliliktarihiInput.value = this.turkishToIsoDate(p.evliliktarihi);
            adresInput.value = p.adres || '';
            
            // Sadece yönetici personel silebilir
            const isAdmin = this.state.currentUser.role === 'Yönetici';
            deleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        } else {
            titleEl.textContent = 'Yeni Personel Kaydı Oluştur';
            idInput.value = '';
            nameInput.value = '';
            titleInput.value = '';
            sicilInput.value = '';
            deptInput.value = '';
            phoneInput.value = '';
            emailInput.value = '';
            tcnoInput.value = '';
            dahiliInput.value = '';
            kanInput.value = '';
            tahsiliInput.value = '';
            dogumtarihiInput.value = '';
            dogumyeriInput.value = '';
            nufusiliInput.value = '';
            medenihaliInput.value = '';
            evliliktarihiInput.value = '';
            adresInput.value = '';
            deleteBtn.style.display = 'none';
        }

        modal.style.display = 'flex';
    },

    // Personel Kaydetme
    async savePersonnel() {
        const id = document.getElementById('personnel-modal-id').value;
        const name = document.getElementById('p-name').value.trim();
        const title = document.getElementById('p-title').value.trim();
        const sicil = document.getElementById('p-sicil').value.trim();
        const department = document.getElementById('p-dept').value.trim();
        const phone = document.getElementById('p-phone').value.trim();
        const email = document.getElementById('p-email').value.trim();
        const tcno = document.getElementById('p-tcno').value.trim();
        const dahili = document.getElementById('p-dahili').value.trim();
        const kan = document.getElementById('p-kan').value.trim();
        const tahsili = document.getElementById('p-tahsili').value.trim();
        const dogumtarihiRaw = document.getElementById('p-dogumtarihi').value;
        const evliliktarihiRaw = document.getElementById('p-evliliktarihi').value;
        const dogumtarihi = this.isoToTurkishDate(dogumtarihiRaw);
        const evliliktarihi = this.isoToTurkishDate(evliliktarihiRaw);

        const dogumyeri = document.getElementById('p-dogumyeri').value.trim();
        const nufusili = document.getElementById('p-nufusili').value.trim();
        const medenihali = document.getElementById('p-medenihali').value;
        const adres = document.getElementById('p-adres').value.trim();

        if (!name || !sicil) {
            this.showToast("Ad Soyad ve Sicil numarası zorunludur.", "error");
            return;
        }

        const pData = {
            name, title, sicil, department, phone, email, tcno, dahili, kan, tahsili, dogumtarihi, dogumyeri, nufusili, medenihali, evliliktarihi, adres
        };

        try {
            if (id) {
                pData.id = id;
                await APIClient.updatePersonnel(id, pData);
                this.showToast("Personel kaydı güncellendi.", "success");
            } else {
                await APIClient.createPersonnel(pData);
                this.showToast("Yeni personel kaydı eklendi.", "success");
            }
            this.closeAllModals();
            this.fetchPersonnelList();
            this.triggerImmediatePoll();
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },
    
    // Personel Görüntüleme Modalı Açma
    openPersonnelViewModal(sicil) {
        const p = this.state.personnel.find(item => item.sicil === sicil);
        if (!p) return;
        
        this.closeAllModals();
        const modal = document.getElementById('personnel-view-modal');
        
        document.getElementById('pv-photo').src = `/api/photo?sicil=${encodeURIComponent(p.sicil)}`;
        
        const rankImg = document.getElementById('pv-rank');
        if (p.title) {
            rankImg.style.display = 'inline-block';
            rankImg.src = `/api/rank?name=${encodeURIComponent(p.title)}`;
        } else {
            rankImg.style.display = 'none';
            rankImg.src = '';
        }
        
        document.getElementById('pv-name').textContent = p.name;
        document.getElementById('pv-rutbe').textContent = p.title || 'Belirtilmemiş';
        document.getElementById('pv-sube').textContent = p.department || 'Belirtilmemiş';
        
        document.getElementById('pv-sicil').textContent = p.sicil || '-';
        document.getElementById('pv-tcno').textContent = p.tcno || '-';
        document.getElementById('pv-phone').textContent = p.phone || '-';
        document.getElementById('pv-dahili').textContent = p.dahili || '-';
        document.getElementById('pv-email').textContent = p.email || '-';
        document.getElementById('pv-kan').textContent = p.kan || '-';
        
        const dogum = (p.dogumtarihi || '') + ((p.dogumtarihi && p.dogumyeri) ? ' / ' : '') + (p.dogumyeri || '');
        document.getElementById('pv-dogum').textContent = dogum || '-';
        
        document.getElementById('pv-nufus').textContent = p.nufusili || '-';
        document.getElementById('pv-medeni').textContent = p.medenihali || '-';
        document.getElementById('pv-tahsili').textContent = p.tahsili || '-';
        document.getElementById('pv-evlilik').textContent = p.evliliktarihi || '-';
        document.getElementById('pv-adres').textContent = p.adres || '-';
        
        modal.style.display = 'flex';
    },

    // Personel Silme
    async deletePersonnel() {
        const id = document.getElementById('personnel-modal-id').value;
        if (!id) return;

        const confirmed = await this.showConfirmDialog("Personel Sil", "Bu personel kaydını kalıcı olarak silmek istiyor musunuz?", "Sil", "İptal", "danger");
        if (!confirmed) return;

        try {
            await APIClient.deletePersonnel(id);
            this.showToast("Personel kaydı silindi.", "success");
            this.closeAllModals();
            this.fetchPersonnelList();
            this.triggerImmediatePoll();
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Personel Filtreleme Mantığı
    // Excel CSV Çıktısı Alma (BOM Destekli Türkçe Karakter Korumalı)
    exportPersonnelToCSV() {
        if (this.state.personnel.length === 0) {
            this.showToast("Dışa aktarılacak personel kaydı bulunmamaktadır.", "info");
            return;
        }

        // BOM ekleme - Türkçe karakterlerin Excel'de düzgün açılması için
        let csvContent = "\ufeff";
        csvContent += "Sicil No,Adı Soyadı,Unvanı,Birimi/Şubesi,E-Posta,Telefon,Özel Notlar\n";

        this.state.personnel.forEach(p => {
            const row = [
                `"${(p.sicil || '').replace(/"/g, '""')}"`,
                `"${(p.name || '').replace(/"/g, '""')}"`,
                `"${(p.title || '').replace(/"/g, '""')}"`,
                `"${(p.department || '').replace(/"/g, '""')}"`,
                `"${(p.email || '').replace(/"/g, '""')}"`,
                `"${(p.phone || '').replace(/"/g, '""')}"`,
                `"${(p.notes || '').replace(/"/g, '""')}"`
            ].join(",");
            csvContent += row + "\n";
        });

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `stratejik_personel_listesi_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast("Excel/CSV aktarımı tamamlandı.", "success");
    },

    // --- YÖNETİCİ PANEL METODLARI ---

    // Yönetici Girişi
    async adminLogin() {
        const pwdInput = document.getElementById('admin-password-input');
        const pwd = pwdInput.value;
        if (!pwd) return;

        try {
            const res = await APIClient.adminLogin(pwd);
            this.state.isAdminAuthenticated = true;
            
            pwdInput.value = '';
            this.updateAdminView(true);
            
            if (res.role) {
                this.state.currentUser.role = res.role;
                this.updateRoleBadge(res.role);
            }
            
            this.showToast("Yönetici girişi başarılı. Sistem yetkilerinizi 'Yönetici' sekmesinden düzenleyebilirsiniz.", "success");
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Yönetici Çıkışı
    async adminLogout() {
        try {
            await APIClient.adminLogout();
            this.state.isAdminAuthenticated = false;
            this.updateAdminView(false);
            
            await this.identifyUser();
            this.showToast("Yönetici oturumu kapatıldı.", "info");
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Yönetim Görünümünü Güncelleme
    updateAdminView(isAdmin) {
        const loginView = document.getElementById('admin-login-view');
        const dashboardView = document.getElementById('admin-dashboard-view');
        if (loginView && dashboardView) {
            if (isAdmin) {
                loginView.style.display = 'none';
                dashboardView.style.display = 'block';
                if (this.state.activeTab === 'tab-admin') {
                    this.fetchAdminUsers();
                }
            } else {
                loginView.style.display = 'block';
                dashboardView.style.display = 'none';
            }
        }
    },

    // Kayıtlı Tüm Kullanıcıları Getir
    async fetchAdminUsers() {
        if (!this.state.isAdminAuthenticated) return;
        
        try {
            const data = await APIClient.getAdminUsers();
            this.renderAdminUsersList(data.users);
        } catch (err) {
            console.error("Yönetim verileri çekilemedi:", err);
        }
    },

    // Yönetim: Tüm Kayıtlı Kullanıcılar ve Rol Seçimleri
    renderAdminUsersList(users) {
        const container = document.getElementById('admin-users-roles-list');
        if (!container) return;

        const userEntries = Object.entries(users);
        if (userEntries.length === 0) {
            container.innerHTML = '<p class="text-center">Kayıtlı sistem kullanıcısı bulunamadı.</p>';
            return;
        }

        let html = '';
        
        // 2. Diğer kullanıcıları listele
        html += `<h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 12px; font-weight: 700;">Kayıtlı Cihazlar ve Roller</h4>`;
        
        userEntries.forEach(([username, user]) => {
            const isSelf = username === this.state.currentUser.computer_name ? ' (Siz)' : '';
            const displayName = user.display_name || username;
            
            html += `
                <div class="user-role-item">
                    <div class="user-role-item-info">
                        <h5>${this.escapeHTML(displayName)}${isSelf}</h5>
                        <p>Sicil: ${this.escapeHTML(username)} | IP: ${user.ip} | Rol: <strong>${user.role}</strong></p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <select class="styled-input" style="font-size: 0.8rem; padding: 6px 10px; min-width: 140px;" onchange="App.changeUserRole('${this.escapeHTML(username)}', this.value)">
                            <option value="Misafir" ${user.role === 'Misafir' ? 'selected' : ''}>Misafir</option>
                            <option value="Yetkili" ${user.role === 'Yetkili' ? 'selected' : ''}>Yetkili</option>
                            <option value="Yönetici" ${user.role === 'Yönetici' ? 'selected' : ''}>Yönetici</option>
                        </select>
                        ${!isSelf ? `
                            <button class="btn btn-sm btn-danger icon-btn" title="Cihazı Sil / Oturumu Kapat" style="padding: 4px 6px; display: inline-flex; align-items: center; justify-content: center;" onclick="App.deleteUser('${this.escapeHTML(username)}')">
                                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    // Kullanıcı Rolünü Doğrudan Değiştirme
    async changeUserRole(username, newRole) {
        try {
            await APIClient.changeUserRole(username, newRole);
            this.showToast("Kullanıcı yetkisi güncellendi.", "success");
            this.fetchAdminUsers();
            this.triggerImmediatePoll();
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Kullanıcıyı veritabanından ve oturumundan tamamen silme
    async deleteUser(username) {
        const confirmed = await this.showConfirmDialog("Kullanıcıyı Sil", `"${username}" kullanıcısını silmek istediğinize emin misiniz?\nKullanıcı sistemden anında atılacak ve tekrar girmek istediğinde onay ekranına düşecektir.`, "Sil", "İptal", "danger");
        if (!confirmed) return;

        try {
            await APIClient.deleteUser(username);
            this.showToast("Kullanıcı silindi ve oturumu sonlandırıldı.", "success");
            this.fetchAdminUsers();
            this.triggerImmediatePoll();
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Yönetici Şifresi Değiştirme
    async changeAdminPassword() {
        const currentInput = document.getElementById('admin-current-password');
        const newInput = document.getElementById('admin-new-password');
        
        const current = currentInput.value;
        const newPass = newInput.value;

        if (!current || !newPass) {
            this.showToast("Mevcut ve yeni şifre alanları zorunludur.", "error");
            return;
        }

        try {
            await APIClient.changeAdminPassword(current, newPass);
            this.showToast("Yönetici şifresi başarıyla güncellendi.", "success");
            currentInput.value = '';
            newInput.value = '';
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    exportOfflineDatabase() {
        this.showToast("Çevrimdışı veritabanı hazırlanıyor ve indiriliyor...", "info");
        window.location.assign('/api/admin/export_offline_data');
    },

    // Yönetim İstatistik Özeti
    updateAdminStats() {
        const tCount = document.getElementById('stat-tasks-count');
        const pCount = document.getElementById('stat-personnel-count');
        const mCount = document.getElementById('stat-messages-count');
        const sCounter = document.getElementById('stat-counter');
        
        const tasksBadge = document.getElementById('total-tasks-count-badge');
        if (tasksBadge) tasksBadge.textContent = this.state.tasks.filter(t => t.status !== 'done').length;

        if (tCount) tCount.textContent = this.state.tasks.length;
        if (pCount) pCount.textContent = this.state.personnel.length;
        if (mCount) mCount.textContent = this.state.messages.length;
        if (sCounter) sCounter.textContent = this.state.updateCounter;
    },

    // Tüm Görevleri Kanban Panosuna Render Eder
    renderFilteredTasks(tasks = null) {
        if (tasks) {
            const oldJSON = JSON.stringify(this.state.tasks);
            const newJSON = JSON.stringify(tasks);
            if (oldJSON === newJSON && this.state.tasks && this.state.tasks.length > 0 && this.state.lastFilteredTasksJSON) {
                return; // Veri değişmemişse gereksiz render'ı engelle
            }
            this.state.tasks = tasks;
        }
        let filtered = this.state.tasks || [];
        const searchVal = (this.state.taskFilters.search || '').trim().toLowerCase();
        
        if (searchVal) {
            filtered = filtered.filter(task => {
                const searchText = `${task.title} ${task.assignee} ${task.ebys_no} ${task.creator} ${task.cover_letter || ''}`.toLowerCase();
                return searchText.includes(searchVal);
            });
        }
        
        const newFilteredJSON = JSON.stringify(filtered);
        if (this.state.lastFilteredTasksJSON === newFilteredJSON) {
            return; // Filtrelenmiş görünüm değişmemişse render'ı atla
        }
        this.state.lastFilteredTasksJSON = newFilteredJSON;

        KanbanBoard.renderTasks(filtered);
    },

    // Gizli Yönetici Girişi Butonu Görünürlüğünü Aç/Kapa
    toggleAdminTabVisibility() {
        const adminTabBtn = document.getElementById('tab-btn-admin');
        if (adminTabBtn) {
            if (adminTabBtn.style.display === 'none') {
                adminTabBtn.style.display = 'inline-flex';
                this.showToast("Yönetici giriş sekmesi aktif edildi.", "info");
            } else if (!this.state.isAdminAuthenticated) {
                adminTabBtn.style.display = 'none';
            }
        }
    },

    // --- GENEL YARDIMCI METODLAR ---

    // XSS Temizleyici (HTML Escaping)
    escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    // Toast Popup Bildirim Sistemi
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        // Tost sayısını sınırla (en fazla 3)
        const currentToasts = container.querySelectorAll('.toast');
        if (currentToasts.length >= 3) {
            currentToasts[0].classList.remove('show');
            setTimeout(() => currentToasts[0].remove(), 400);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} toast-notification`;
        
        let icon = 'info';
        if (type === 'success') icon = 'check_circle';
        if (type === 'error') icon = 'warning';

        toast.innerHTML = `
            <span class="material-symbols-outlined">${icon}</span>
            <div class="toast-text">${this.escapeHTML(message)}</div>
            <button class="toast-close"><span class="material-symbols-outlined" style="font-size: 16px;">close</span></button>
            <div class="toast-progress"></div>
        `;

        container.appendChild(toast);

        // Kapatma butonu işlevi
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        });

        // Giriş animasyonu
        setTimeout(() => toast.classList.add('show'), 10);

        // 3.5 saniye sonra otomatik kaldır
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            }
        }, 3500);
    },

    // Web Audio API tabanlı premium sesli bildirim (chime)
    playNotificationSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc1.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5
            
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(293.66, audioCtx.currentTime); // D4
            osc2.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.12); // A4
            
            gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
            
            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc1.start();
            osc2.start();
            
            osc1.stop(audioCtx.currentTime + 0.5);
            osc2.stop(audioCtx.currentTime + 0.5);
        } catch (e) {
            console.warn("AudioContext chime failed:", e);
        }
    },

    // Yönetici Onay Bekleyenleri İşleme
    processPendingApprovals(pendingUsers) {
        // Badge güncellemesi
        const badge = document.getElementById('admin-pending-badge');
        if (badge) {
            if (pendingUsers.length > 0) {
                badge.textContent = pendingUsers.length;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        // Popup gösterimi (Her oturumda sadece bir kez gösterilmesini sağlamak için set kullanıyoruz)
        if (!this.shownApprovalPopups) {
            this.shownApprovalPopups = new Set();
        }

        pendingUsers.forEach(user => {
            if (!this.shownApprovalPopups.has(user.computer_name)) {
                this.shownApprovalPopups.add(user.computer_name);
                this.showApprovalPopup(user);
            }
        });
    },

    // Onay Popup Gösterimi
    showApprovalPopup(user) {
        const container = document.getElementById('approval-popup-container');
        if (!container) return;

        const popup = document.createElement('div');
        popup.className = 'approval-popup';
        popup.innerHTML = `
            <div class="approval-popup-header">
                <span class="material-symbols-outlined">notification_important</span>
                <h4>Yeni Kullanıcı Onayı</h4>
            </div>
            <div class="approval-popup-body">
                <div class="info-row">
                    <span class="material-symbols-outlined">person</span>
                    <span>Personel: <strong>${this.escapeHTML(user.display_name || 'Bilinmeyen')}</strong></span>
                </div>
                <div class="info-row">
                    <span class="material-symbols-outlined">computer</span>
                    <span>Sicil/Cihaz: <strong>${this.escapeHTML(user.computer_name)}</strong></span>
                </div>
                <div class="info-row">
                    <span class="material-symbols-outlined">router</span>
                    <span>IP: <strong>${this.escapeHTML(user.ip)}</strong></span>
                </div>
            </div>
            <div class="approval-popup-actions">
                <button class="btn btn-reject" onclick="App.handleQuickApprove('${this.escapeHTML(user.computer_name)}', 'reject', this)">Reddet</button>
                <button class="btn btn-approve" onclick="App.handleQuickApprove('${this.escapeHTML(user.computer_name)}', 'approve', this)">Onayla</button>
            </div>
        `;
        container.appendChild(popup);
        
        // Sesli bildirim
        if (this.state.soundNotification) {
            this.playNotificationSound();
        }
    },

    // Hızlı Onay/Ret İşlemi
    async handleQuickApprove(computerName, action, btnElement) {
        const popup = btnElement.closest('.approval-popup');
        try {
            await APIClient.quickApproveUser(computerName, action);
            this.showToast(`Kullanıcı ${action === 'approve' ? 'onaylandı' : 'reddedildi'}.`, "success");
            
            // Popup'ı kapat
            if (popup) {
                popup.classList.add('removing');
                setTimeout(() => popup.remove(), 300);
            }
            
            this.triggerImmediatePoll();
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    // Özel Onay Dialoğu
    showConfirmDialog(title, message, confirmText = 'Onayla', cancelText = 'İptal', type = 'warning') {
        return new Promise((resolve) => {
            const container = document.getElementById('confirm-dialog-container');
            if (!container) {
                resolve(window.confirm(message)); // Fallback
                return;
            }

            const iconMap = {
                'warning': 'warning',
                'danger': 'error',
                'info': 'info'
            };
            const iconColorMap = {
                'warning': 'var(--color-warning)',
                'danger': 'var(--color-danger)',
                'info': 'var(--accent-primary)'
            };

            const overlay = document.createElement('div');
            overlay.className = 'confirm-dialog-overlay';
            
            const dialog = document.createElement('div');
            dialog.className = 'confirm-dialog';
            
            dialog.innerHTML = `
                <span class="material-symbols-outlined confirm-icon" style="color: ${iconColorMap[type]}">${iconMap[type]}</span>
                <h3>${this.escapeHTML(title)}</h3>
                <p>${this.escapeHTML(message)}</p>
                <div class="confirm-dialog-actions">
                    <button class="btn btn-secondary" id="confirm-cancel-btn">${this.escapeHTML(cancelText)}</button>
                    <button class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}" id="confirm-ok-btn">${this.escapeHTML(confirmText)}</button>
                </div>
            `;
            
            overlay.appendChild(dialog);
            container.appendChild(overlay);

            const closeDialog = (result) => {
                overlay.style.animation = 'modalFadeIn 0.2s reverse forwards';
                dialog.style.animation = 'modalContentIn 0.2s reverse forwards';
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 200);
            };

            dialog.querySelector('#confirm-cancel-btn').addEventListener('click', () => closeDialog(false));
            dialog.querySelector('#confirm-ok-btn').addEventListener('click', () => closeDialog(true));
            
            // Klavye desteği
            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleKeydown);
                    closeDialog(false);
                } else if (e.key === 'Enter') {
                    document.removeEventListener('keydown', handleKeydown);
                    closeDialog(true);
                }
            };
            document.addEventListener('keydown', handleKeydown);
            
            // Focus on cancel by default for safety
            dialog.querySelector('#confirm-cancel-btn').focus();
        });
    },

    // --- GENEL YARDIMCI METODLAR ---

    turkishToIsoDate(trDate) {
        if (!trDate) return '';
        const parts = trDate.split('.');
        if (parts.length !== 3) return '';
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
    },

    isoToTurkishDate(isoDate) {
        if (!isoDate) return '';
        const parts = isoDate.split('-');
        if (parts.length !== 3) return '';
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${day}.${month}.${year}`;
    },

    // --- HAFTA SONU & GÖREV KAYDI YARDIMCI METODLARI ---

    populateDutyPersonnelSelect() {
        const select = document.getElementById('duty-form-personnel');
        if (!select) return;

        // Keep the first option
        const firstOption = select.options[0];
        select.innerHTML = '';
        select.appendChild(firstOption);

        if (!this.state.personnel || this.state.personnel.length === 0) return;

        // Filter personnel to show only those whose department is "Stratejik Yönetim Şube Müdürlüğü"
        const filtered = this.state.personnel.filter(p => p.department && p.department.trim() === 'Stratejik Yönetim Şube Müdürlüğü');

        // Sort personnel by name in Turkish locale
        const sorted = filtered.sort((a, b) => a.name.localeCompare(b, 'tr'));

        sorted.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.sicil;
            opt.textContent = `${p.name} (${p.sicil}) - ${p.title || ''}`;
            select.appendChild(opt);
        });
    },

    async saveDutyRecord() {
        const personnelSelect = document.getElementById('duty-form-personnel');
        const dateInput = document.getElementById('duty-form-date');
        const typeSelect = document.getElementById('duty-form-type');
        const durationInput = document.getElementById('duty-form-duration');
        const descInput = document.getElementById('duty-form-description');

        if (!personnelSelect || !dateInput || !typeSelect || !durationInput || !descInput) return;

        const sicil = personnelSelect.value;
        const selectedOpt = personnelSelect.options[personnelSelect.selectedIndex];
        if (!sicil) {
            this.showToast("Lütfen bir personel seçin.", "error");
            return;
        }

        // Extract clean name from option text (format is "Name (Sicil) - Rank")
        const personObj = this.state.personnel.find(p => p.sicil === sicil);
        const name = personObj ? personObj.name : selectedOpt.textContent.split(' (')[0];

        const dateVal = dateInput.value;
        if (!dateVal) {
            this.showToast("Lütfen bir tarih seçin.", "error");
            return;
        }

        // Format date from yyyy-mm-dd to dd.mm.yyyy for Turkish standard display
        const dateParts = dateVal.split('-');
        const formattedDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;

        const typeVal = typeSelect.value;
        const durationVal = parseInt(durationInput.value) || 1;
        const descVal = descInput.value.trim();

        const submitBtn = document.getElementById('btn-save-duty');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const res = await APIClient.request('/api/duty/create', 'POST', {
                sicil: sicil,
                name: name,
                date: formattedDate,
                type: typeVal,
                duration: durationVal,
                description: descVal
            });

            if (res.success) {
                this.showToast("Kayıt başarıyla eklendi.", "success");
                // Reset form
                dateInput.value = '';
                personnelSelect.value = '';
                descInput.value = '';
                durationInput.value = '1';
                typeSelect.value = 'weekend_shift';
                
                // Refresh
                this.triggerImmediatePoll();
            }
        } catch (err) {
            this.showToast(err.message, "error");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    },

    async deleteDutyRecord(recordId) {
        const confirmed = await this.showConfirmDialog(
            "Kaydı Sil",
            "Bu nöbet/görev kaydını tamamen silmek istediğinize emin misiniz?",
            "Evet, Sil",
            "İptal",
            "danger"
        );
        if (!confirmed) return;

        try {
            const res = await APIClient.request('/api/duty/delete', 'POST', { id: recordId });
            if (res.success) {
                this.showToast("Kayıt silindi.", "success");
                this.triggerImmediatePoll();
            }
        } catch (err) {
            this.showToast(err.message, "error");
        }
    },

    renderDutyRegistry() {
        const tbody = document.getElementById('duty-records-table-body');
        if (!tbody) return;

        const records = this.state.dutyRegistry || [];

        // Get filter inputs
        const searchInput = document.getElementById('duty-filter-search');
        const typeSelect = document.getElementById('duty-filter-type');
        const startInput = document.getElementById('duty-filter-start-date');
        const endInput = document.getElementById('duty-filter-end-date');

        const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const typeVal = typeSelect ? typeSelect.value : '';
        const startVal = startInput ? startInput.value : ''; // yyyy-mm-dd
        const endVal = endInput ? endInput.value : ''; // yyyy-mm-dd

        // Helper to convert dd.mm.yyyy string to a Date object
        const parseDateString = (str) => {
            if (!str) return null;
            const parts = str.split('.');
            if (parts.length !== 3) return null;
            return new Date(parts[2], parts[1] - 1, parts[0]);
        };

        const startDate = startVal ? new Date(startVal) : null;
        if (startDate) startDate.setHours(0, 0, 0, 0);

        const endDate = endVal ? new Date(endVal) : null;
        if (endDate) endDate.setHours(23, 59, 59, 999);

        // Filter records
        const filtered = records.filter(r => {
            // 1. Search name/sicil
            if (searchVal) {
                const nameMatch = r.name && r.name.toLowerCase().includes(searchVal);
                const sicilMatch = r.sicil && r.sicil.toLowerCase().includes(searchVal);
                if (!nameMatch && !sicilMatch) return false;
            }

            // 2. Type filter
            if (typeVal && r.type !== typeVal) return false;

            // 3. Date range filter
            if (startDate || endDate) {
                const rDate = parseDateString(r.date);
                if (!rDate) return false;
                if (startDate && rDate < startDate) return false;
                if (endDate && rDate > endDate) return false;
            }

            return true;
        });

        // Sort records by date descending (latest first)
        filtered.sort((a, b) => {
            const dateA = parseDateString(a.date) || 0;
            const dateB = parseDateString(b.date) || 0;
            if (dateA && dateB) {
                return dateB - dateA;
            }
            return 0;
        });

        // Render table body
        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 30px; opacity: 0.5;">
                        Arama kriterlerine uygun kayıt bulunamadı.
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = '';
            filtered.forEach(r => {
                const tr = document.createElement('tr');
                tr.className = 'stagger-item';
                
                const typeBadge = r.type === 'weekend_shift' 
                    ? `<span class="badge-weekend"><span class="material-symbols-outlined" style="font-size: 14px;">weekend</span> Mesai</span>`
                    : `<span class="badge-duty"><span class="material-symbols-outlined" style="font-size: 14px;">flight_takeoff</span> Dış Görev</span>`;

                tr.innerHTML = `
                    <td style="padding: 12px 16px;">
                        <div style="font-weight: 600; color: var(--text-primary);">${this.escapeHTML(r.name)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${this.escapeHTML(r.sicil)}</div>
                    </td>
                    <td style="padding: 12px 16px; white-space: nowrap;">${this.escapeHTML(r.date)}</td>
                    <td style="padding: 12px 16px;">${typeBadge}</td>
                    <td style="padding: 12px 16px; font-weight: 700;">${r.duration || 1} Gün</td>
                    <td style="padding: 12px 16px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHTML(r.description || '')}">
                        ${this.escapeHTML(r.description || '-')}
                    </td>
                    <td style="padding: 12px 16px; font-size: 0.8rem; color: var(--text-secondary);">${this.escapeHTML(r.created_by || '')}</td>
                    <td style="padding: 12px 16px; text-align: center;">
                        <button class="btn-delete-record icon-btn" style="color: var(--color-danger);" title="Kaydı Sil">
                            <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                        </button>
                    </td>
                `;

                // Bind delete event
                tr.querySelector('.btn-delete-record').addEventListener('click', () => {
                    this.deleteDutyRecord(r.id);
                });

                tbody.appendChild(tr);
            });
        }

        this.updateDutyStats(records);
    },

    updateDutyStats(records) {
        const totalChip = document.getElementById('duty-stat-total');
        const weekendChip = document.getElementById('duty-stat-weekend');
        const dutyChip = document.getElementById('duty-stat-duty');

        if (!totalChip || !weekendChip || !dutyChip) return;

        let totalCount = records.length;
        let weekendDays = 0;
        let dutyDays = 0;

        // Group by personnel name (and sicil) for top lists
        const weekendRankMap = {}; // name -> total_days
        const dutyRankMap = {}; // name -> total_days
        const sicilToNameMap = {}; // sicil -> name

        records.forEach(r => {
            const duration = parseInt(r.duration) || 1;
            const sicil = r.sicil || r.name;
            sicilToNameMap[sicil] = r.name;

            if (r.type === 'weekend_shift') {
                weekendDays += duration;
                weekendRankMap[sicil] = (weekendRankMap[sicil] || 0) + duration;
            } else if (r.type === 'external_duty') {
                dutyDays += duration;
                dutyRankMap[sicil] = (dutyRankMap[sicil] || 0) + duration;
            }
        });

        // Set top counters
        totalChip.textContent = totalCount;
        weekendChip.textContent = weekendDays;
        dutyChip.textContent = dutyDays;

        // Render Weekend Shift Rankings (Top 5)
        const weekendRankingContainer = document.getElementById('duty-ranking-weekend');
        if (weekendRankingContainer) {
            const sortedWeekend = Object.entries(weekendRankMap)
                .map(([sicil, days]) => ({ sicil, name: sicilToNameMap[sicil], days }))
                .sort((a, b) => b.days - a.days)
                .slice(0, 5);

            if (sortedWeekend.length === 0) {
                weekendRankingContainer.innerHTML = '<div style="text-align: center; opacity: 0.5; padding-top: 30px; font-size: 0.8rem;">Kayıt bulunmuyor.</div>';
            } else {
                weekendRankingContainer.innerHTML = sortedWeekend.map((item, idx) => `
                    <div class="ranking-item">
                        <div>
                            <span class="ranking-name">${idx + 1}. ${this.escapeHTML(item.name)}</span>
                            <div class="ranking-info">Sicil: ${this.escapeHTML(item.sicil)}</div>
                        </div>
                        <span class="ranking-value weekend">${item.days} Gün</span>
                    </div>
                `).join('');
            }
        }

        // Render External Duty Rankings (Top 5)
        const dutyRankingContainer = document.getElementById('duty-ranking-duty');
        if (dutyRankingContainer) {
            const sortedDuty = Object.entries(dutyRankMap)
                .map(([sicil, days]) => ({ sicil, name: sicilToNameMap[sicil], days }))
                .sort((a, b) => b.days - a.days)
                .slice(0, 5);

            if (sortedDuty.length === 0) {
                dutyRankingContainer.innerHTML = '<div style="text-align: center; opacity: 0.5; padding-top: 30px; font-size: 0.8rem;">Kayıt bulunmuyor.</div>';
            } else {
                dutyRankingContainer.innerHTML = sortedDuty.map((item, idx) => `
                    <div class="ranking-item">
                        <div>
                            <span class="ranking-name">${idx + 1}. ${this.escapeHTML(item.name)}</span>
                            <div class="ranking-info">Sicil: ${this.escapeHTML(item.sicil)}</div>
                        </div>
                        <span class="ranking-value duty">${item.days} Gün</span>
                    </div>
                `).join('');
            }
        }
    },

    exportDutyToCSV() {
        const records = this.state.dutyRegistry || [];
        if (records.length === 0) {
            this.showToast("Aktarılacak kayıt bulunmuyor.", "error");
            return;
        }

        // CSV Header
        let csvContent = "\uFEFF"; // UTF-8 BOM for Turkish character support in Excel
        csvContent += "Ad Soyad,Sicil,Tarih,Tür,Açıklama,Süre (Gün),Ekleyen,Oluşturulma Tarihi\n";

        records.forEach(r => {
            const typeStr = r.type === 'weekend_shift' ? "Hafta Sonu Mesaisi" : "Dış Görev";
            const row = [
                `"${(r.name || '').replace(/"/g, '""')}"`,
                `"${(r.sicil || '')}"`,
                `"${r.date || ''}"`,
                `"${typeStr}"`,
                `"${(r.description || '').replace(/"/g, '""')}"`,
                `"${r.duration || 1}"`,
                `"${(r.created_by || '').replace(/"/g, '""')}"`,
                `"${r.created_at || ''}"`
            ].join(',');
            csvContent += row + "\n";
        });

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `nobet_ve_gorev_kayitlari_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast("Kayıtlar CSV olarak dışa aktarıldı.", "success");
    }
};

// Sayfa tamamen yüklendiğinde uygulamayı başlat
window.addEventListener('DOMContentLoaded', () => {
    App.init();
});
