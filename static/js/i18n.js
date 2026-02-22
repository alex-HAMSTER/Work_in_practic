window.i18n = {
    currentLang: localStorage.getItem('lang') || 'uk',
    translations: {},

    async init() {
        await this.loadTranslations(this.currentLang);
        this.updateDOM();
        this.setupSwitcher();
    },

    async loadTranslations(lang) {
        try {
            const res = await fetch(`/static/locales/${lang}.json`);
            this.translations = await res.json();
            this.currentLang = lang;
            localStorage.setItem('lang', lang);
            document.documentElement.lang = lang;
        } catch (e) {
            console.error("Failed to load translations for lang:", lang, e);
        }
    },

    t(key) {
        return this.translations[key] || key;
    },

    updateDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        });

        // Notify other scripts that language changed
        window.dispatchEvent(new Event('languageChanged'));
    },

    async changeLang(lang) {
        if (lang === this.currentLang) return;
        await this.loadTranslations(lang);
        this.updateDOM();
    },

    setupSwitcher() {
        const flagMap = {
            'uk': { src: '/static/img/localisation/Flag_of_Ukraine.svg.png', text: 'UA' },
            'en': { src: '/static/img/localisation/Flag_of_the_United_Kingdom.webp', text: 'EN' },
            'da': { src: '/static/img/localisation/Flag_of_Denmark.svg.webp', text: 'DA' }
        };

        const dropdowns = document.querySelectorAll('.lang-dropdown');

        dropdowns.forEach(dropdown => {
            const btn = dropdown.querySelector('.lang-dropdown-btn');
            const flag = dropdown.querySelector('#currentLangFlag');
            const text = dropdown.querySelector('#currentLangText');
            const menu = dropdown.querySelector('.lang-dropdown-menu');
            const options = dropdown.querySelectorAll('.lang-option');

            // Set initial state
            if (flagMap[this.currentLang] && flag && text) {
                flag.src = flagMap[this.currentLang].src;
                text.textContent = flagMap[this.currentLang].text;
            }

            // Toggle menu
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('open');
                const expanded = dropdown.classList.contains('open');
                btn.setAttribute('aria-expanded', expanded);
            });

            // Handle option click
            options.forEach(option => {
                option.addEventListener('click', () => {
                    const lang = option.getAttribute('data-lang');

                    if (flag && text && flagMap[lang]) {
                        flag.src = flagMap[lang].src;
                        text.textContent = flagMap[lang].text;
                    }

                    dropdown.classList.remove('open');
                    btn.setAttribute('aria-expanded', 'false');
                    this.changeLang(lang);
                });
            });

            // Close on click outside
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.remove('open');
                    btn.setAttribute('aria-expanded', 'false');
                }
            });
        });
    }
};

window.t = (key) => window.i18n.t(key);

document.addEventListener('DOMContentLoaded', () => {
    window.i18n.init();
});
