/**
 * Stratejik Yönetim Portal - API İletişim İstemcisi (Supabase Serverless Emülatörü)
 * Sunucu isteklerini yakalayıp doğrudan Supabase bulut veritabanına yönlendirir.
 */

const APIClient = {
    // Genel istek yapıcı (Supabase entegrasyonu ile API interceptor)
    async request(url, method = 'GET', data = null) {
        // Initialize Supabase client if not already done
        if (!window.supabaseClient) {
            const { createClient } = window.supabase;
            window.supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        }
        const supabase = window.supabaseClient;

        try {
            // 1. Kimlik Tanımlama API
            if (url.includes('/api/identify')) {
                return {
                    computer_name: localStorage.getItem('web_computer_name') || 'Yönetici PC',
                    ip: 'Yerel Ağ',
                    role: sessionStorage.getItem('admin_logged_in') === 'true' ? 'Yönetici' : 'Misafir',
                    status: 'Aktif',
                    approved: true
                };
            }

            // 2. Profil Güncelleme API
            if (url.includes('/api/user/update')) {
                localStorage.setItem('web_computer_name', data.computer_name);
                return { success: true };
            }

            // 3. Polling Güncelleme API (Tüm veritabanı değişikliklerini tek seferde okur)
            if (url.includes('/api/updates')) {
                const [
                    { data: dbDevices },
                    { data: dbTasks },
                    { data: dbMessages },
                    { data: dbPersonnel },
                    { data: dbDuty }
                ] = await Promise.all([
                    supabase.from('devices').select('*'),
                    supabase.from('tasks').select('*'),
                    supabase.from('messages').select('*').order('created_at', { ascending: true }),
                    supabase.from('personnel').select('*'),
                    supabase.from('duty_registry').select('*')
                ]);

                // Cihazları kullanıcı sözlüğüne dönüştür
                const users = {};
                (dbDevices || []).forEach(d => {
                    users[d.name || d.id] = {
                        ip: 'Mobil Cihaz',
                        role: d.status === 'approved' ? 'Editor' : 'Misafir',
                        last_seen: d.updated_at || d.created_at,
                        status: d.status === 'approved' ? 'Aktif' : d.status === 'blocked' ? 'Meşgul' : 'Dışarıda'
                    };
                });

                // Görev yorumlarını dizi olarak doğrula
                const tasks = (dbTasks || []).map(t => ({
                    ...t,
                    comments: t.comments || []
                }));

                const messages = (dbMessages || []).map(m => ({
                    id: m.id,
                    text: m.text,
                    sender: m.sender,
                    recipient: m.recipient || 'global',
                    created_at: m.created_at
                }));

                const counter = parseInt(url.split('counter=')[1]) || 0;

                return {
                    counter: counter + 1,
                    updated: true,
                    users: users,
                    tasks: tasks,
                    messages: messages,
                    duty_registry: dbDuty || [],
                    personnel: dbPersonnel || [],
                    has_changes: true,
                    pending_approvals: (dbDevices || []).filter(d => d.status === 'pending')
                };
            }

            // 4. Sohbet Mesajı Gönderme API
            if (url.includes('/api/chat/send')) {
                const sender = localStorage.getItem('web_computer_name') || 'Yönetici PC';
                const { data: inserted, error } = await supabase.from('messages').insert([{
                    id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
                    text: data.text,
                    sender: sender,
                    recipient: data.recipient || 'global',
                    created_at: new Date().toISOString()
                }]).select().single();
                if (error) throw error;
                return inserted;
            }

            // 4.5. Sohbet Mesajı Silme
            if (url.includes('/api/chat/delete')) {
                const { error } = await supabase.from('messages').delete().eq('id', data.id);
                if (error) throw error;
                return { success: true };
            }

            // 4.6. Sohbet Okundu Olarak İşaretleme
            if (url.includes('/api/chat/mark_read')) {
                return { success: true };
            }

            // 5. Görev Oluşturma API
            if (url.includes('/api/tasks/create')) {
                const creator = localStorage.getItem('web_computer_name') || 'Yönetici PC';
                const newTask = {
                    id: data.id || `task_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
                    title: data.title,
                    desc: data.desc || '',
                    guide: data.guide || '',
                    ebys_no: data.ebys_no || '',
                    source_branch: data.source_branch || '',
                    destination: data.destination || '',
                    cover_letter: data.cover_letter || '',
                    status: data.status || 'todo',
                    assignee: data.assignee || 'Atanmamış',
                    priority: data.priority || 'Orta',
                    start_date: data.start_date || '',
                    end_date: data.end_date || '',
                    recurrence: data.recurrence || 'none',
                    comments: [],
                    creator,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                const { data: inserted, error } = await supabase.from('tasks').insert([newTask]).select().single();
                if (error) throw error;
                return inserted;
            }

            // 6. Görev Sürükle Bırak Durum Güncelleme API
            if (url.includes('/api/tasks/update_status')) {
                const { data: updated, error } = await supabase
                    .from('tasks')
                    .update({ status: data.status, updated_at: new Date().toISOString() })
                    .eq('id', data.id)
                    .select()
                    .single();
                if (error) throw error;
                return updated;
            }

            // 7. Görev Kartı Düzenleme API
            if (url.includes('/api/tasks/edit')) {
                const { data: updated, error } = await supabase
                    .from('tasks')
                    .update({
                        title: data.title,
                        desc: data.desc || '',
                        guide: data.guide || '',
                        ebys_no: data.ebys_no || '',
                        source_branch: data.source_branch || '',
                        destination: data.destination || '',
                        cover_letter: data.cover_letter || '',
                        status: data.status || 'todo',
                        assignee: data.assignee || 'Atanmamış',
                        priority: data.priority || 'Orta',
                        start_date: data.start_date || '',
                        end_date: data.end_date || '',
                        recurrence: data.recurrence || 'none',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', data.id)
                    .select()
                    .single();
                if (error) throw error;
                return updated;
            }

            // 8. Görev Kartı Silme API
            if (url.includes('/api/tasks/delete')) {
                const { error } = await supabase.from('tasks').delete().eq('id', data.id);
                if (error) throw error;
                return { success: true };
            }

            // 9. Görev Yorum Ekleme API
            if (url.includes('/api/tasks/comment') && !url.includes('/api/tasks/comment/delete')) {
                const author = localStorage.getItem('web_computer_name') || 'Yönetici PC';
                const newComment = {
                    id: Math.random().toString(36).substr(2, 9),
                    author,
                    text: data.text,
                    created_at: new Date().toISOString()
                };
                const { data: task, error: getErr } = await supabase.from('tasks').select('comments').eq('id', data.id).single();
                if (getErr) throw getErr;
                const comments = task.comments || [];
                comments.push(newComment);
                const { data: updated, error } = await supabase.from('tasks').update({ comments }).eq('id', data.id).select().single();
                if (error) throw error;
                return updated;
            }

            // 10. Görev Yorum Silme API
            if (url.includes('/api/tasks/comment/delete')) {
                const { data: task, error: getErr } = await supabase.from('tasks').select('comments').eq('id', data.task_id).single();
                if (getErr) throw getErr;
                const comments = (task.comments || []).filter(c => c.id !== data.comment_id);
                const { error } = await supabase.from('tasks').update({ comments }).eq('id', data.task_id);
                if (error) throw error;
                return { success: true };
            }

            // 11. Personel Listesi Sorgulama API
            if (url === '/api/personnel') {
                const { data: list, error } = await supabase.from('personnel').select('*');
                if (error) throw error;
                return list || [];
            }

            // 12. Personel Kartı Kaydetme API
            if (url.includes('/api/personnel/create')) {
                const newP = {
                    id: data.id || `p_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
                    name: data.name,
                    title: data.title || '',
                    department: data.department || '',
                    sicil: data.sicil,
                    email: data.email || '',
                    phone: data.phone || '',
                    dahili: data.dahili || '',
                    tcno: data.tcno || '',
                    kan: data.kan || '',
                    tahsili: data.tahsili || '',
                    dogumtarihi: data.dogumtarihi || '',
                    dogumyeri: data.dogumyeri || '',
                    nufusili: data.nufusili || '',
                    medenihali: data.medenihali || '',
                    evliliktarihi: data.evliliktarihi || '',
                    adres: data.adres || '',
                    photo: data.photo || '',
                    created_at: new Date().toISOString()
                };
                const { data: inserted, error } = await supabase.from('personnel').insert([newP]).select().single();
                if (error) throw error;
                return inserted;
            }

            // 13. Personel Kartı Düzenleme API
            if (url.includes('/api/personnel/update')) {
                const { data: updated, error } = await supabase.from('personnel').update(data).eq('id', data.id).select().single();
                if (error) throw error;
                return updated;
            }

            // 14. Personel Kartı Silme API
            if (url.includes('/api/personnel/delete')) {
                const { error } = await supabase.from('personnel').delete().eq('id', data.id);
                if (error) throw error;
                return { success: true };
            }

            // 15. Nöbet / Mesai Kayıt Ekleme API
            if (url.includes('/api/duty/create')) {
                const { data: pDetail } = await supabase.from('personnel').select('name, sicil').eq('id', data.personnel_id).single();
                const pName = pDetail ? pDetail.name : 'Bilinmeyen';
                const pSicil = pDetail ? pDetail.sicil : '';
                
                const newDuty = {
                    id: `duty_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
                    personnel_id: data.personnel_id,
                    personnel_name: pName,
                    personnel_sicil: pSicil,
                    date: data.date,
                    duration: parseInt(data.duration) || 1,
                    type: data.type,
                    description: data.description || '',
                    creator: localStorage.getItem('web_computer_name') || 'Yönetici PC',
                    created_at: new Date().toISOString()
                };
                const { data: inserted, error } = await supabase.from('duty_registry').insert([newDuty]).select().single();
                if (error) throw error;
                return inserted;
            }

            // 16. Nöbet / Mesai Kayıt Silme API
            if (url.includes('/api/duty/delete')) {
                const { error } = await supabase.from('duty_registry').delete().eq('id', data.id);
                if (error) throw error;
                return { success: true };
            }

            // 17. Yönetici Giriş API
            if (url.includes('/api/admin/login')) {
                if (data.password === CONFIG.ADMIN_PASSWORD) {
                    sessionStorage.setItem('admin_logged_in', 'true');
                    return { success: true, token: 'web_admin_token' };
                } else {
                    throw new Error('Şifre hatalı!');
                }
            }

            // 18. Yönetici Çıkış API
            if (url.includes('/api/admin/logout')) {
                sessionStorage.removeItem('admin_logged_in');
                return { success: true };
            }

            // 19. Yönetim - Kullanıcı Listesi API
            if (url.includes('/api/admin/users')) {
                const { data: dbDevices, error } = await supabase.from('devices').select('*');
                if (error) throw error;
                return (dbDevices || []).map(d => ({
                    computer_name: d.name || d.id,
                    ip: 'Mobil Cihaz',
                    role: d.status === 'approved' ? 'Editor' : 'Misafir',
                    last_seen: d.updated_at || d.created_at,
                    status: d.status === 'approved' ? 'Aktif' : d.status === 'blocked' ? 'Meşgul' : 'Dışarıda'
                }));
            }

            // 20. Yönetim - Rol Değiştirme API
            if (url.includes('/api/admin/change_role')) {
                const status = data.role === 'Editor' || data.role === 'Admin' || data.role === 'Yönetici' ? 'approved' : 'blocked';
                const { error } = await supabase
                    .from('devices')
                    .update({ status, updated_at: new Date().toISOString() })
                    .or(`name.eq."${data.computer_name}",id.eq."${data.computer_name}"`);
                if (error) throw error;
                return { success: true };
            }

            // 21. Yönetim - Cihaz Kaydı Silme API
            if (url.includes('/api/admin/delete_user')) {
                const { error } = await supabase
                    .from('devices')
                    .delete()
                    .or(`name.eq."${data.computer_name}",id.eq."${data.computer_name}"`);
                if (error) throw error;
                return { success: true };
            }

            // 22. Yönetim - Hızlı Cihaz Onay API
            if (url.includes('/api/admin/quick_approve')) {
                const status = data.action === 'approve' ? 'approved' : 'blocked';
                const { error } = await supabase
                    .from('devices')
                    .update({ status, updated_at: new Date().toISOString() })
                    .or(`name.eq."${data.computer_name}",id.eq."${data.computer_name}"`);
                if (error) throw error;
                return { success: true };
            }

            // 23. Yönetim - Şifre Değiştirme (Bulutta local config kullanıldığı için doğrudan başarılı döner)
            if (url.includes('/api/admin/change_password')) {
                return { success: true };
            }

            throw new Error(`Bilinmeyen API ucu yakalandı: ${url}`);
        } catch (error) {
            console.error(`Emulated API Hatası (${url}):`, error);
            throw error;
        }
    },

    // ----------------------------------------------------
    // WRAPPERS FOR ORIGINAL CALLS
    // ----------------------------------------------------
    async identify() {
        return await this.request('/api/identify');
    },

    async updateProfile(computerName, status) {
        return await this.request('/api/user/update', 'POST', {
            computer_name: computerName,
            status: status
        });
    },

    async checkUpdates(counter) {
        return await this.request(`/api/updates?counter=${counter}`);
    },

    async sendChatMessage(text, recipient = "global") {
        return await this.request('/api/chat/send', 'POST', { text: text, recipient: recipient });
    },

    async markMessagesRead(sender) {
        return await this.request('/api/chat/mark_read', 'POST', { sender: sender });
    },

    async requestPermission(role) {
        return Promise.resolve();
    },

    async createTask(taskData) {
        return await this.request('/api/tasks/create', 'POST', taskData);
    },

    async updateTaskStatus(taskId, status) {
        return await this.request('/api/tasks/update_status', 'POST', {
            id: taskId,
            status: status
        });
    },

    async editTask(taskData) {
        return await this.request('/api/tasks/edit', 'POST', taskData);
    },

    async deleteTask(taskId) {
        return await this.request('/api/tasks/delete', 'POST', { id: taskId });
    },

    async deleteChatMessage(messageId) {
        return await this.request('/api/chat/delete', 'POST', { id: messageId });
    },

    async deleteTaskComment(taskId, commentId) {
        return await this.request('/api/tasks/comment/delete', 'POST', {
            task_id: taskId,
            comment_id: commentId
        });
    },

    async addTaskComment(taskId, text) {
        return await this.request('/api/tasks/comment', 'POST', {
            id: taskId,
            text: text
        });
    },

    async getPersonnel() {
        return await this.request('/api/personnel');
    },

    async createPersonnel(pData) {
        return await this.request('/api/personnel/create', 'POST', pData);
    },

    async updatePersonnel(pId, pData) {
        return await this.request('/api/personnel/update', 'POST', {
            id: pId,
            ...pData
        });
    },

    async deletePersonnel(pId) {
        return await this.request('/api/personnel/delete', 'POST', { id: pId });
    },

    async adminLogin(password) {
        return await this.request('/api/admin/login', 'POST', { password: password });
    },

    async adminLogout() {
        return await this.request('/api/admin/logout', 'POST');
    },

    async getAdminUsers() {
        return await this.request('/api/admin/users');
    },

    async changeUserRole(computerName, newRole) {
        return await this.request('/api/admin/change_role', 'POST', {
            computer_name: computerName,
            role: newRole
        });
    },

    async deleteUser(computerName) {
        return await this.request('/api/admin/delete_user', 'POST', {
            computer_name: computerName
        });
    },

    async changeAdminPassword(currentPassword, newPassword) {
        return await this.request('/api/admin/change_password', 'POST', {
            current_password: currentPassword,
            new_password: newPassword
        });
    },

    async quickApproveUser(computerName, action) {
        return await this.request('/api/admin/quick_approve', 'POST', {
            computer_name: computerName,
            action: action
        });
    }
};
