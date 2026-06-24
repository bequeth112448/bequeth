/**
 * Stratejik Yönetim Portal - Kanban Görev Panosu Kontrolü
 * Sürükle-bırak mantığını ve sunucu senkronizasyonunu yönetir.
 */

const KanbanBoard = {
    isDragging: false, // Çakışmayı önlemek için polling sırasında kart yenilemeyi kilitleyen değişken
    isFirstRender: true,

    init() {
        this.bindColumnEvents();
    },

    // Sütunların sürükleme olaylarını dinle
    bindColumnEvents() {
        const columns = document.querySelectorAll('.kanban-column');
        
        columns.forEach(column => {
            // Kart sütunun üzerine geldiğinde
            column.addEventListener('dragover', (e) => {
                e.preventDefault(); // Sürüklemeye izin ver
                column.classList.add('drag-over');
            });

            // Kart sütundan çıktığında
            column.addEventListener('dragleave', () => {
                column.classList.remove('drag-over');
            });

            // Kart sütuna bırakıldığında
            column.addEventListener('drop', async (e) => {
                e.preventDefault();
                column.classList.remove('drag-over');

                const taskId = e.dataTransfer.getData('text/plain');
                const newStatus = column.getAttribute('data-status');
                
                if (taskId && newStatus) {
                    this.isDragging = false;
                    
                    // Arayüzü anında güncelle (İyimser Güncelleme)
                    const task = App.state.tasks.find(t => String(t.id) === String(taskId));
                    if (task) {
                        task.status = newStatus;
                        this.renderTasks(App.state.tasks);
                    }

                    // Sunucuya kaydet
                    try {
                        await APIClient.updateTaskStatus(taskId, newStatus);
                        App.showToast("Görev durumu güncellendi.", "success");
                        // Sunucu sayacını güncellemek için zorla tetikle
                        App.triggerImmediatePoll();
                    } catch (error) {
                        App.showToast("Durum güncellenirken hata oluştu: " + error.message, "error");
                    }
                }
            });
        });
    },

    // Kart elemanına sürükleme olaylarını bağla
    bindCardEvents(cardElement) {
        cardElement.addEventListener('dragstart', (e) => {
            const taskId = cardElement.getAttribute('data-id');
            e.dataTransfer.setData('text/plain', taskId);
            
            // Sürükleme efekti
            setTimeout(() => {
                cardElement.classList.add('dragging');
            }, 0);
            
            this.isDragging = true;
        });

        cardElement.addEventListener('dragend', () => {
            cardElement.classList.remove('dragging');
            this.isDragging = false;
        });
    },

    // Kanban sütun başlıklarındaki sayaçları günceller
    updateColumnCounters() {
        ['todo', 'in_progress', 'done'].forEach(status => {
            const col = document.getElementById(`cards-${status}`);
            const countSpan = document.getElementById(`count-${status}`);
            if (col && countSpan) {
                countSpan.textContent = col.children.length;
            }
        });
    },

    // Görevleri arayüze basar
    renderTasks(tasks) {
        // Kullanıcı o sırada sürükleme yapıyorsa arayüzü yeniden çizmeyi atla (UX Koruması)
        if (this.isDragging) return;

        // Kanban sütunlarını temizle
        const containers = {
            todo: document.getElementById('cards-todo'),
            in_progress: document.getElementById('cards-in_progress'),
            done: document.getElementById('cards-done')
        };

        // Kapsayıcıları sıfırla
        Object.values(containers).forEach(container => {
            if (container) container.innerHTML = '';
        });

        if (!tasks || tasks.length === 0) {
            this.updateColumnCounters();
            return;
        }

        // Görevleri durumlarına göre ayıralım
        const doneTasks = tasks.filter(task => task.status === 'done');
        const otherTasks = tasks.filter(task => task.status !== 'done');

        // Tamamlanan görevleri tarihlerine göre (eskiden yeniye) sıralayalım. Tarihi olmayanlar en sonda kalır.
        doneTasks.sort((a, b) => {
            const dateA = a.start_date || '9999-12-31';
            const dateB = b.start_date || '9999-12-31';
            return dateA.localeCompare(dateB);
        });

        let animationIndex = 0;

        // Diğer görevleri sütunlara dağıt (Todo ve In Progress)
        otherTasks.forEach(task => {
            const container = containers[task.status];
            if (!container) return;

            const card = this.createTaskCardElement(task);
            if (this.isFirstRender) {
                card.classList.add('stagger-item');
                card.style.animationDelay = `${animationIndex * 0.05}s`;
                animationIndex++;
            }
            
            container.appendChild(card);
            
            // Sürükleme olaylarını bağla
            this.bindCardEvents(card);
        });

        // Sıralanmış Tamamlanan görevleri ekle
        doneTasks.forEach(task => {
            const container = containers['done'];
            if (!container) return;

            const card = this.createTaskCardElement(task);
            if (this.isFirstRender) {
                card.classList.add('stagger-item');
                card.style.animationDelay = `${animationIndex * 0.05}s`;
                animationIndex++;
            }
            
            container.appendChild(card);
            
            // Sürükleme olaylarını bağla
            this.bindCardEvents(card);
        });

        // Sayaçları güncelle
        this.updateColumnCounters();
        this.isFirstRender = false;
    },
    // Görev kartı HTML yapısını üretir (XSS Korumalı)
    createTaskCardElement(task) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.id = `task-card-${task.id}`;
        card.setAttribute('data-id', task.id);
        card.setAttribute('draggable', 'true');

        // Öncelik etiket sınıfı kaldırıldı, durum noktası rengi kullanılacak.

        // Yorum sayısı HTML'i
        const commentsCount = task.comments ? task.comments.length : 0;
        let commentsHTML = '';
        if (commentsCount > 0) {
            commentsHTML = `
                <div class="task-card-comments" title="${commentsCount} yorum var">
                    <span class="material-symbols-outlined">comment</span>
                    <strong>${commentsCount}</strong>
                </div>
            `;
        }

        // Tarih aralığı ve tekrarlama ikonu HTML'i
        let dateHTML = '';
        if (task.start_date || task.end_date) {
            const formatTurkishDate = (startStr, endStr) => {
                const months = [
                    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", 
                    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
                ];
                
                const parseDate = (dateStr) => {
                    if (!dateStr) return null;
                    const parts = dateStr.split('-');
                    if (parts.length !== 3) return null;
                    return {
                        day: parseInt(parts[2], 10),
                        month: parseInt(parts[1], 10),
                        monthName: months[parseInt(parts[1], 10) - 1],
                        year: parts[0]
                    };
                };

                const start = parseDate(startStr);
                const end = parseDate(endStr);

                if (!start && !end) return '';
                if (start && !end) return `${start.day} ${start.monthName} ${start.year}`;
                if (!start && end) return `${end.day} ${end.monthName} ${end.year}`;
                
                if (start.month === end.month && start.year === end.year) {
                    if (start.day === end.day) return `${start.day} ${start.monthName} ${start.year}`;
                    return `${start.day}-${end.day} ${start.monthName} ${start.year}`;
                } else {
                    if (start.year === end.year) {
                        return `${start.day} ${start.monthName} - ${end.day} ${end.monthName} ${end.year}`;
                    } else {
                        return `${start.day} ${start.monthName} ${start.year} - ${end.day} ${end.monthName} ${end.year}`;
                    }
                }
            };
            
            const formattedDate = formatTurkishDate(task.start_date, task.end_date);
            
            let recurrenceSymbol = '';
            if (task.recurrence && task.recurrence !== 'none') {
                recurrenceSymbol = '🔄 ';
            }

            if (formattedDate) {
                let tooltipTitle = 'Görev Süresi Belirtilmemiş';
                if (task.start_date && task.end_date) {
                    tooltipTitle = `Görev Süresi: ${task.start_date} - ${task.end_date}`;
                } else if (task.start_date) {
                    tooltipTitle = `Başlangıç Tarihi: ${task.start_date}`;
                } else if (task.end_date) {
                    tooltipTitle = `Bitiş Tarihi: ${task.end_date}`;
                }
                
                // Gecikmiş görev kontrolünü tarih alanı oluştururken yapabilmek için geçici fonksiyonu burada çağıralım
                const checkOverdue = () => {
                    if (task.status === 'done') return false;
                    const dateStr = task.end_date || task.start_date;
                    if (!dateStr) return false;
                    const d = new Date();
                    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    return todayStr > dateStr;
                };

                if (checkOverdue()) {
                    dateHTML = `
                        <span class="task-card-date status-overdue-text" title="${tooltipTitle} - SÜRESİ GEÇTİ!" style="color: var(--color-danger); font-weight: 600; animation: textPulse 1s ease-in-out infinite;">
                            🚨 Süresi Geçti (${formattedDate})
                        </span>
                    `;
                } else {
                    dateHTML = `
                        <span class="task-card-date" title="${tooltipTitle}">
                            ${recurrenceSymbol}${formattedDate}
                        </span>
                    `;
                }
            }
        }

        // Gecikmiş (süresi geçmiş) görevleri filtrele (tarihi bugünden küçük olanlar)
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

        // Zamanı gelen görevleri yeşil yap (Bugün başlangıç/bitiş aralığındaysa ve bitmemişse)
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

        let isOverdue = isTaskOverdue(task);
        let isActiveDue = isTaskActiveDue(task);

        if (isOverdue) {
            card.classList.add('task-overdue');
        } else if (isActiveDue) {
            card.classList.add('active-due');
        }

        // Nokta rengi belirleme (süresi geçen = hızlı yanıp sönen kırmızı, süresi gelen = kırmızı, yapılan = yeşil, beklemede = sarı)
        let dotClass = 'status-pending'; // beklemede olan (sarı)
        let dotTitle = 'Beklemede';
        
        if (task.status === 'done') {
            dotClass = 'status-completed'; // yapılan (yeşil)
            dotTitle = 'Tamamlandı';
        } else if (isOverdue) {
            dotClass = 'status-overdue'; // süresi geçti (hızlı yanıp sönen kırmızı)
            dotTitle = 'Süresi Geçti';
        } else if (isActiveDue) {
            dotClass = 'status-due'; // süresi gelen (kırmızı)
            dotTitle = 'Süresi Geldi';
        }

        card.innerHTML = `
            <div class="task-card-left">
                <span class="task-status-dot ${dotClass}" title="${dotTitle}"></span>
                <h4></h4>
            </div>
            <div class="task-card-right">
                ${dateHTML}
                ${commentsHTML}
                <span class="material-symbols-outlined task-card-edit-indicator">edit</span>
            </div>
        `;

        // XSS Koruması: Dışarıdan gelen verileri textContent ile güvenle ata
        card.querySelector('h4').textContent = task.title;

        // Tıklama olayı (Detay / Düzenleme penceresi açmak için)
        card.addEventListener('click', () => {
            App.openTaskModal(task);
        });

        return card;
    }
};
