// Merkezi JavaScript Kontrol Dosyası
// Sayfa geçişleri ve eserler kontrolü

class BlogController {
    constructor() {
        this.currentPage = 'anasayfa';
        this.init();
    }

    init() {
        // Element referansları
        this.navLinks = document.querySelectorAll('.nav-link');
        this.pages = document.querySelectorAll('.page');
        this.neonButton = document.querySelector('.neon-buton');
        this.logoHome = document.getElementById('logoHome');

        this.bindEvents();
        this.initPageNavigation();
    }

    initPageNavigation() {
        // URL hash'inden sayfa yükle
        const hash = window.location.hash.substring(1);
        if (hash && ['anasayfa', 'hakkinda', 'eserlerim', 'iletisim'].includes(hash)) {
            this.showPage(hash);
        } else {
            this.showPage('anasayfa');
        }
    }

    bindEvents() {
        // Menü linklerine tıklama
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                if (page) {
                    this.showPage(page);
                    // URL hash'ini güncelle
                    window.history.pushState({ page }, '', `#${page}`);
                }
            });
        });

        // Logo'ya tıklama - Ana sayfaya git
        if (this.logoHome) {
            this.logoHome.addEventListener('click', () => {
                this.showPage('anasayfa');
                window.history.pushState({ page: 'anasayfa' }, '', '#anasayfa');
            });
        }

        // "Eserlerimi İncele" butonuna tıklama
        if (this.neonButton) {
            this.neonButton.addEventListener('click', (e) => {
                e.preventDefault();
                const page = this.neonButton.getAttribute('data-page');
                if (page) {
                    this.showPage(page);
                    window.history.pushState({ page }, '', `#${page}`);
                }
            });
        }

        // Browser geri/ileri butonları için
        window.addEventListener('popstate', (e) => {
            const hash = window.location.hash.substring(1);
            if (hash && ['anasayfa', 'hakkinda', 'eserlerim', 'iletisim'].includes(hash)) {
                this.showPage(hash);
            } else {
                this.showPage('anasayfa');
            }
        });
    }

    showPage(pageName) {
        // Tüm sayfaları gizle
        this.pages.forEach(page => {
            page.classList.remove('active');
        });

        // Aktif sayfayı göster
        const targetPage = document.getElementById(`page-${pageName}`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = pageName;
        }

        // Menü linklerini güncelle
        this.navLinks.forEach(link => {
            if (link.getAttribute('data-page') === pageName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Sayfanın en üstüne kaydır
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Eserler sayfası için kitap gösterme fonksiyonu
function kitapGoster(kitapId) {
    var tumKitaplar = document.getElementsByClassName('kitap-detay');
    for (var i = 0; i < tumKitaplar.length; i++) {
        tumKitaplar[i].style.display = 'none';
    }

    document.getElementById(kitapId).style.display = 'block';

    var tiklananLink = event.currentTarget;

    var tumLinkler = document.getElementsByClassName('eser-link');
    for (var i = 0; i < tumLinkler.length; i++) {
        tumLinkler[i].classList.remove('active');
    }

    tiklananLink.classList.add('active');
}

// İletişim formu kontrolü
function initContactForm() {
    const contactForm = document.getElementById('contactForm');
    const formMessage = document.getElementById('formMessage');
    const contactMessage = document.getElementById('contactMessage');
    const charCount = document.getElementById('charCount');

    // Karakter sayacı
    if (contactMessage && charCount) {
        contactMessage.addEventListener('input', () => {
            const length = contactMessage.value.length;
            charCount.textContent = length;
            
            if (length > 1000) {
                charCount.style.color = '#f44336';
                contactMessage.style.borderColor = '#f44336';
            } else if (length > 800) {
                charCount.style.color = '#ff9800';
                contactMessage.style.borderColor = '#ff9800';
            } else {
                charCount.style.color = '#4CAF50';
                contactMessage.style.borderColor = '';
            }
        });
    }

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const formData = {
                name: document.getElementById('contactName').value.trim(),
                email: document.getElementById('contactEmail').value.trim(),
                subject: document.getElementById('contactSubject').value.trim(),
                message: document.getElementById('contactMessage').value.trim()
            };

            // Basit validasyon
            if (!formData.name || !formData.email || !formData.subject || !formData.message) {
                showFormMessage('Lütfen tüm alanları doldurunuz.', 'error');
                return;
            }

            // Mesaj uzunluk kontrolü
            if (formData.message.length > 1000) {
                showFormMessage('Mesajınız 1000 karakterden uzun olamaz. Lütfen kısaltın.', 'error');
                return;
            }

            if (formData.message.length < 10) {
                showFormMessage('Mesajınız en az 10 karakter olmalıdır.', 'error');
                return;
            }

            // Email validasyonu
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.email)) {
                showFormMessage('Lütfen geçerli bir e-posta adresi giriniz.', 'error');
                return;
            }

            // Gönder butonunu devre dışı bırak
            const submitBtn = contactForm.querySelector('.btn-submit');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Gönderiliyor...';

            // Simüle edilmiş gönderim (gerçek uygulamada backend'e gönderilir)
            setTimeout(() => {
                // Form verilerini localStorage'a kaydet
                const messages = JSON.parse(localStorage.getItem('contactMessages') || '[]');
                messages.push({
                    ...formData,
                    date: new Date().toISOString(),
                    id: Date.now()
                });
                localStorage.setItem('contactMessages', JSON.stringify(messages));

                // Başarı mesajı göster
                showFormMessage('Mesajınız başarıyla gönderildi! Düşünceleriniz bana ulaştı. En kısa sürede size dönüş yapacağım.', 'success');
                
                // Formu temizle
                contactForm.reset();
                if (charCount) charCount.textContent = '0';

                // Butonu tekrar aktif et
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;

                // Mesajı 6 saniye sonra gizle
                setTimeout(() => {
                    formMessage.style.display = 'none';
                }, 6000);
            }, 1500);
        });
    }
}

function showFormMessage(message, type) {
    const formMessage = document.getElementById('formMessage');
    if (formMessage) {
        formMessage.textContent = message;
        formMessage.className = `form-message ${type}`;
        formMessage.style.display = 'block';
    }
}

// Sayfa yüklendiğinde uygulamayı başlat
document.addEventListener('DOMContentLoaded', () => {
    new BlogController();
    initContactForm();
});
