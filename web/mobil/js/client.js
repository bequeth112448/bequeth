/**
 * Stratejik Yönetim Portal - Mobil API İstemcisi
 * Sunucu IP adresi ve portunu dinamik okuyarak tüm REST isteklerini oraya yönlendirir.
 */
const APIClient = {
    // LocalStorage üzerinden kayıtlı sunucu URL'ini döndürür
    getServerUrl() {
        return localStorage.getItem('server_url') || '';
    },

    // Sunucu URL'ini kaydeder
    setServerUrl(url) {
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }
        // Sondaki eğik çizgiyi temizle
        if (url && url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        localStorage.setItem('server_url', url || '');
    },

    // Sunucu bağlantısını test eder
    async testConnection(testUrl) {
        if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
            testUrl = 'http://' + testUrl;
        }
        if (testUrl.endsWith('/')) {
            testUrl = testUrl.slice(0, -1);
        }
        
        try {
            // Sunucuya hafif bir tanılama isteği at
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000); // 4sn zaman aşımı
            
            const res = await fetch(`${testUrl}/api/identify`, {
                method: 'GET',
                signal: controller.signal,
                credentials: 'include' // Çerez yetkilendirmesi için
            });
            clearTimeout(timeoutId);
            
            if (res.status === 200 || res.status === 401 || res.status === 403) {
                // Sunucu yanıt verdi, erişilebilir durumdadır
                return true;
            }
            return false;
        } catch (e) {
            console.error("Bağlantı testi başarısız:", e);
            return false;
        }
    },

    // Genel İstek Atıcı (CORS uyumlu)
    async request(path, method = 'GET', body = null) {
        const baseUrl = this.getServerUrl();
        if (!baseUrl) {
            throw new Error("Sunucu adresi yapılandırılmadı!");
        }

        const url = `${baseUrl}${path}`;
        const options = {
            method: method,
            headers: {},
            credentials: 'include' // Mobil WebView'da oturum çerezlerini korumak için şarttır
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json; charset=utf-8';
            options.body = JSON.stringify(body);
        }

        try {
            const res = await fetch(url, options);
            
            if (!res.ok) {
                // Hata mesajını çek
                let errMsg = "İşlem başarısız oldu.";
                try {
                    const errData = await res.json();
                    errMsg = errData.error || errMsg;
                } catch(e) {}
                
                throw new Error(errMsg);
            }

            return await res.json();
        } catch (err) {
            console.error(`API Hatası (${path}):`, err);
            throw err;
        }
    },

    // --- API Uç Noktaları ---

    // Kullanıcıyı tanımla
    async identify() {
        return await this.request('/api/identify');
    },

    // Durum ve veri güncellemelerini çek (Polling)
    async checkUpdates(counter) {
        return await this.request(`/api/updates?counter=${counter}`);
    },

    // Profil durumunu güncelle
    async updateProfile(name, status) {
        return await this.request('/api/user/update', 'POST', {
            name: name,
            status: status
        });
    },

    // Tüm personelleri çek
    async getPersonnel() {
        return await this.request('/api/personnel');
    },

    // Hafta Sonu / Dış Görev kaydı ekle
    async createDutyRecord(recordData) {
        return await this.request('/api/duty/create', 'POST', recordData);
    },

    // Hafta Sonu / Dış Görev kaydı sil
    async deleteDutyRecord(recordId) {
        return await this.request('/api/duty/delete', 'POST', { id: recordId });
    },

    // Yönetici: Hızlı kullanıcı onayı/reddi
    async quickApprove(computerName, action) {
        return await this.request('/api/admin/quick_approve', 'POST', {
            computer_name: computerName,
            action: action
        });
    }
};
