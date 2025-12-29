import gsap from 'gsap';
import confetti from 'canvas-confetti';

const GAME_TYPES = {
    GUESS: 'guess',
    TRANSLATE: 'translate',
    SENTENCE: 'sentence',
    GRAMMAR: 'grammar',
    HANGMAN: 'hangman',
    NUM_TO_WORD: 'numToWord',
    WORD_TO_NUM: 'wordToNum',
    COLORS: 'colors',
    ANIMAL: 'animal',
    JOBS: 'jobs',
    DAYS: 'days',
    MONTHS: 'months',
    FAMILY: 'family',
    PLACES: 'places',
    OBJECTS: 'objects',
    CLOTHES: 'clothes',
    ADJECTIVES: 'adjectives'
};

class App {
    constructor() {
        this.score = 0;
        this.currentLevel = 0;
        this.currentGame = null;
        this.timerInterval = null;
        this.timeLeft = 30;
        this.theme = 'dark';
        this.maxLevels = 200;
        
        // Progress structure: { gameType: { level: 0, medals: 0, completed: false } }
        this.progress = this.loadProgress();

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {};
        this.synth = window.speechSynthesis;

        this.init();
        this.setupEventListeners();
        this.registerServiceWorker();
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW reg failed', err));
            });
        }
    }

    setupEventListeners() {
        // Global click to resume AudioContext (Browser requirement)
        window.addEventListener('click', () => {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }, { once: true });

        // Menu items
        const menuGrid = document.getElementById('game-menu-grid');
        if (menuGrid) {
            menuGrid.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-game]');
                if (btn) {
                    this.startGame(btn.dataset.game);
                }
            });
        }

        // Standard Browser Back Button Handling
        window.addEventListener('popstate', (event) => {
            const gameScreen = document.getElementById('game-screen');
            const medalScreen = document.getElementById('medals-screen');
            const modal = document.getElementById('modal-overlay');

            if (modal && !modal.classList.contains('hidden')) {
                this.closeModal();
            } else if (medalScreen && !medalScreen.classList.contains('hidden')) {
                this.hideMedals();
            } else if (gameScreen && !gameScreen.classList.contains('hidden')) {
                this.showMenu(true); // true means don't trigger history.back()
            }
        });
    }

    async init() {
        document.body.classList.add('dark');
        this.updateMenuUI();
        this.initEitaaBackButton();
        
        // Safety fallback for splash screen
        this.splashTimeout = setTimeout(() => this.finishSplash(), 4000);

        // Animate loading bar
        gsap.to('#loading-bar', {
            width: '100%',
            duration: 2.5,
            ease: "power1.inOut",
            onComplete: () => this.finishSplash()
        });

        this.loadSound('success', 'success.mp3');
        this.loadSound('fail', 'fail.mp3');
        this.loadSound('click', 'click.mp3');
    }

    toggleTheme() {
        this.playSound('click');
        const oldTheme = this.theme;
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        document.body.classList.remove(oldTheme);
        document.body.classList.add(this.theme);
    }

    finishSplash() {
        if (this.splashFinished) return;
        this.splashFinished = true;
        clearTimeout(this.splashTimeout);

        gsap.to('#splash-screen', {
            opacity: 0,
            duration: 0.5,
            onComplete: () => {
                document.getElementById('splash-screen').style.display = 'none';
                const container = document.getElementById('game-container');
                container.style.opacity = 1;
                document.body.style.overflow = 'auto';
                document.getElementById('main-menu').classList.remove('hidden');
                gsap.fromTo('#main-menu', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5 });
            }
        });
    }

    async loadSound(name, url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.sounds[name] = await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.error('Sound load error', e);
        }
    }

    playSound(name) {
        if (!this.sounds[name]) return;
        try {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            const source = this.audioContext.createBufferSource();
            source.buffer = this.sounds[name];
            source.connect(this.audioContext.destination);
            source.start(0);
        } catch (e) {
            console.warn('Audio play failed', e);
        }
    }

    speak(text, lang = 'en-US', onEndCallback = null) {
        if (!this.synth) {
            if (onEndCallback) onEndCallback();
            return;
        }
        this.synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9;
        if (onEndCallback) {
            utterance.onend = () => onEndCallback();
            utterance.onerror = () => onEndCallback();
        }
        this.synth.speak(utterance);
    }

    showMenu(fromPopState = false) {
        this.stopTimer();
        this.updateEitaaBackButton(false);
        
        // If we are showing menu manually (not via physical back button), 
        // and we were in a sub-view, clear history state
        if (!fromPopState && history.state === 'subview') {
            history.back();
        }

        gsap.to('#game-screen', { opacity: 0, duration: 0.3, onComplete: () => {
            document.getElementById('game-screen').classList.add('hidden');
            document.getElementById('main-menu').classList.remove('hidden');
            gsap.fromTo('#main-menu', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5 });
        }});
    }

    startGame(type) {
        this.playSound('click');
        const gameProgress = this.progress[type] || { level: 0, medals: 0, completed: false };

        if (gameProgress.completed) {
            this.pendingGameType = type;
            this.showModal();
            return;
        }

        this.actualStart(type, gameProgress.level);
    }

    actualStart(type, level = 0) {
        this.currentGame = type;
        this.score = 0;
        this.currentLevel = level;
        document.getElementById('score').innerText = '۰';
        
        // Push state to handle back button
        history.pushState('subview', '');

        document.getElementById('main-menu').classList.add('hidden');
        const screen = document.getElementById('game-screen');
        screen.classList.remove('hidden');
        this.updateEitaaBackButton(true);
        gsap.fromTo(screen, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 });

        this.renderLevel();
    }

    showModal() {
        const modal = document.getElementById('modal-overlay');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        gsap.fromTo('#modal-content', { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3 });
    }

    closeModal() {
        const modal = document.getElementById('modal-overlay');
        gsap.to('#modal-content', { scale: 0.8, opacity: 0, duration: 0.2, onComplete: () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }});
    }

    confirmReset() {
        this.closeModal();
        if (this.pendingGameType) {
            this.progress[this.pendingGameType].level = 0;
            this.progress[this.pendingGameType].completed = false;
            this.saveProgress();
            this.actualStart(this.pendingGameType, 0);
            this.updateMenuUI();
        }
    }

    loadProgress() {
        const saved = localStorage.getItem('learnita_v3_progress');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse progress", e);
            }
        }
        
        const initialProgress = {};
        Object.keys(GAME_TYPES).forEach(k => {
            initialProgress[GAME_TYPES[k]] = { level: 0, medals: 0, completed: false };
        });
        return initialProgress;
    }

    saveProgress() {
        localStorage.setItem('learnita_v3_progress', JSON.stringify(this.progress));
    }

    updateMenuUI() {
        Object.keys(GAME_TYPES).forEach(key => {
            const type = GAME_TYPES[key];
            const btn = document.querySelector(`[data-game="${type}"]`);
            if (btn) {
                const badge = btn.querySelector('.status-badge');
                const prog = this.progress[type] || { level: 0, medals: 0, completed: false };
                
                let html = '';
                if (prog.medals > 0) {
                    html += `<div class="bg-yellow-500/80 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">🏅 ${prog.medals}</div>`;
                }
                if (prog.completed) {
                    html += `<div class="bg-green-500/80 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">کامل شد</div>`;
                } else if (prog.level > 0) {
                    html += `<div class="bg-blue-500/80 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">Lvl ${prog.level + 1}</div>`;
                }
                badge.innerHTML = html;
            }
        });
    }

    showMedals() {
        this.playSound('click');
        this.updateEitaaBackButton(true);
        history.pushState('subview', '');
        const screen = document.getElementById('medals-screen');
        const grid = document.getElementById('medals-grid');
        grid.innerHTML = '';

        let hasMedals = false;
        Object.keys(GAME_TYPES).forEach(key => {
            const type = GAME_TYPES[key];
            const prog = this.progress[type];
            if (prog && prog.medals > 0) {
                hasMedals = true;
                const card = document.createElement('div');
                card.className = 'glass p-4 rounded-3xl flex flex-col items-center text-center';
                const displayName = document.querySelector(`[data-game="${type}"] span`).innerText;
                card.innerHTML = `
                    <div class="text-4xl mb-2">🏅</div>
                    <div class="font-bold text-sm mb-1">${displayName}</div>
                    <div class="text-xs text-yellow-400 font-bold">${prog.medals} بار دریافت شده</div>
                `;
                grid.appendChild(card);
            }
        });

        if (!hasMedals) {
            grid.innerHTML = '<p class="col-span-2 text-center opacity-50 py-10">هنوز مدالی کسب نکرده‌اید!</p>';
        }

        screen.classList.remove('hidden');
        gsap.fromTo(screen, { y: '100%' }, { y: 0, duration: 0.4, ease: 'power2.out' });
    }

    hideMedals(fromPopState = false) {
        this.updateEitaaBackButton(false);
        if (!fromPopState && history.state === 'subview') {
            history.back();
        }
        const screen = document.getElementById('medals-screen');
        gsap.to(screen, { y: '100%', duration: 0.3, onComplete: () => screen.classList.add('hidden') });
    }

    initEitaaBackButton() {
        try {
            if (window.Eitaa && Eitaa.WebApp && Eitaa.WebApp.BackButton) {
                Eitaa.WebApp.BackButton.onClick(() => {
                    const gameScreen = document.getElementById('game-screen');
                    const medalScreen = document.getElementById('medals-screen');
                    
                    if (!medalScreen.classList.contains('hidden')) {
                        this.hideMedals();
                    } else if (!gameScreen.classList.contains('hidden')) {
                        this.showMenu();
                    }
                });
            }
        } catch (e) {}
    }

    openArvin() {
        const url = 'https://eitaa.com/Arvinweb';
        // Prefer SDK method if available (per developer.eitaa.com JS SDK)
        try {
            if (window.Eitaa && Eitaa.WebApp) {
                // Different SDK builds might expose different helpers; try common names
                if (typeof Eitaa.WebApp.openLink === 'function') {
                    Eitaa.WebApp.openLink(url);
                    return;
                }
                if (typeof Eitaa.WebApp.openUrl === 'function') {
                    Eitaa.WebApp.openUrl(url);
                    return;
                }
                if (typeof Eitaa.WebApp.open === 'function') {
                    Eitaa.WebApp.open(url);
                    return;
                }
            }
        } catch (e) {
            console.warn('Eitaa open link failed', e);
        }
        // Fallback to standard navigation
        window.open(url, '_blank');
    }

    updateEitaaBackButton(show) {
        try {
            if (window.Eitaa && Eitaa.WebApp && Eitaa.WebApp.BackButton) {
                if (show) Eitaa.WebApp.BackButton.show();
                else Eitaa.WebApp.BackButton.hide();
            }
        } catch (e) {}
    }

    renderLevel() {
        const content = document.getElementById('game-content');
        const timerBox = document.getElementById('timer-box');
        content.innerHTML = '';
        timerBox.classList.add('hidden');

        switch (this.currentGame) {
            case GAME_TYPES.GUESS:
                this.renderGuessGame();
                break;
            case GAME_TYPES.TRANSLATE:
                this.renderTranslateGame();
                break;
            case GAME_TYPES.SENTENCE:
                this.renderSentenceGame();
                break;
            case GAME_TYPES.GRAMMAR:
                this.renderGrammarGame();
                break;
            case GAME_TYPES.HANGMAN:
                this.renderHangmanGame();
                break;
            case GAME_TYPES.NUM_TO_WORD:
                this.renderNumToWordGame();
                break;
            case GAME_TYPES.WORD_TO_NUM:
                this.renderWordToNumGame();
                break;
            case GAME_TYPES.COLORS:
                this.renderColorsGame();
                break;
            case GAME_TYPES.ANIMAL:
                this.renderAnimalGame();
                break;
            case GAME_TYPES.JOBS:
                this.renderJobsGame();
                break;
            case GAME_TYPES.DAYS:
                this.renderDaysGame();
                break;
            case GAME_TYPES.MONTHS:
                this.renderMonthsGame();
                break;
            case GAME_TYPES.FAMILY:
                this.renderFamilyGame();
                break;
            case GAME_TYPES.PLACES:
                this.renderPlacesGame();
                break;
            case GAME_TYPES.OBJECTS:
                this.renderObjectsGame();
                break;
            case GAME_TYPES.CLOTHES:
                this.renderClothesGame();
                break;
            case GAME_TYPES.ADJECTIVES:
                this.renderAdjectivesGame();
                break;
        }
    }

    // --- DATA LIBRARIES (Scaling to 300+ items) ---
    getVocabData(category) {
        const libraries = {
            animals: [
                { en: 'Cat', fa: 'گربه' }, { en: 'Dog', fa: 'سگ' }, { en: 'Lion', fa: 'شیر' }, { en: 'Elephant', fa: 'فیل' },
                { en: 'Tiger', fa: 'ببر' }, { en: 'Rabbit', fa: 'خرگوش' }, { en: 'Giraffe', fa: 'زرافه' }, { en: 'Monkey', fa: 'میمون' },
                { en: 'Snake', fa: 'مار' }, { en: 'Zebra', fa: 'گورخر' }, { en: 'Panda', fa: 'پاندا' }, { en: 'Wolf', fa: 'گرگ' },
                { en: 'Fox', fa: 'روباه' }, { en: 'Bear', fa: 'خرس' }, { en: 'Eagle', fa: 'عقاب' }, { en: 'Dolphin', fa: 'دلفین' },
                { en: 'Shark', fa: 'کوسه' }, { en: 'Ant', fa: 'مورچه' }, { en: 'Bee', fa: 'زنبور' }, { en: 'Spider', fa: 'عنکبوت' },
                { en: 'Horse', fa: 'اسب' }, { en: 'Cow', fa: 'گاو' }, { en: 'Sheep', fa: 'گوسفند' }, { en: 'Chicken', fa: 'مرغ' },
                { en: 'Duck', fa: 'اردک' }, { en: 'Frog', fa: 'قورباغه' }, { en: 'Turtle', fa: 'لاک‌پشت' }, { en: 'Fish', fa: 'ماهی' },
                { en: 'Whale', fa: 'وال' }, { en: 'Octopus', fa: 'اختاپوس' }, { en: 'Butterfly', fa: 'پروانه' }, { en: 'Bird', fa: 'پرنده' },
                { en: 'Parrot', fa: 'طوطی' }, { en: 'Mouse', fa: 'موش' }, { en: 'Camel', fa: 'شتر' }, { en: 'Donkey', fa: 'الاغ' },
                { en: 'Deer', fa: 'آهو' }, { en: 'Goat', fa: 'بز' }, { en: 'Owl', fa: 'جغد' }, { en: 'Kangaroo', fa: 'کانگورو' }
            ],
            jobs: [
                { en: 'Doctor', fa: 'دکتر' }, { en: 'Teacher', fa: 'معلم' }, { en: 'Engineer', fa: 'مهندس' }, { en: 'Pilot', fa: 'خلبان' },
                { en: 'Chef', fa: 'آشپز' }, { en: 'Farmer', fa: 'کشاورز' }, { en: 'Driver', fa: 'راننده' }, { en: 'Singer', fa: 'خواننده' },
                { en: 'Lawyer', fa: 'وکیل' }, { en: 'Artist', fa: 'هنرمند' }, { en: 'Nurse', fa: 'پرستار' }, { en: 'Police', fa: 'پلیس' },
                { en: 'Dentist', fa: 'دندانپزشک' }, { en: 'Baker', fa: 'نانوا' }, { en: 'Writer', fa: 'نویسنده' }, { en: 'Actor', fa: 'بازیگر' },
                { en: 'Soldier', fa: 'سرباز' }, { en: 'Scientist', fa: 'دانشمند' }, { en: 'Architect', fa: 'معمار' }, { en: 'Mechanic', fa: 'مکانیک' },
                { en: 'Electrician', fa: 'برق‌کار' }, { en: 'Plumber', fa: 'لوله‌کش' }, { en: 'Gardener', fa: 'باغبان' }, { en: 'Firefighter', fa: 'آتش‌نشان' },
                { en: 'Photographer', fa: 'عکاس' }, { en: 'Journalist', fa: 'خبرنگار' }, { en: 'Librarian', fa: 'کتابدار' }, { en: 'Coach', fa: 'مربی' }
            ],
            family: [
                { en: 'Father', fa: 'پدر' }, { en: 'Mother', fa: 'مادر' }, { en: 'Brother', fa: 'برادر' }, { en: 'Sister', fa: 'خواهر' },
                { en: 'Grandfather', fa: 'پدربزرگ' }, { en: 'Grandmother', fa: 'مادربزرگ' }, { en: 'Uncle', fa: 'عمو/دایی' }, { en: 'Aunt', fa: 'عمه/خاله' },
                { en: 'Cousin', fa: 'پسرعمو/دخترخاله' }, { en: 'Son', fa: 'پسر' }, { en: 'Daughter', fa: 'دختر' }, { en: 'Baby', fa: 'نوزاد' },
                { en: 'Wife', fa: 'زن (همسر)' }, { en: 'Husband', fa: 'شوهر (همسر)' }, { en: 'Parents', fa: 'والدین' }, { en: 'Children', fa: 'بچه‌ها' },
                { en: 'Grandson', fa: 'نوه پسری' }, { en: 'Granddaughter', fa: 'نوه دختری' }, { en: 'Nephew', fa: 'برادرزاده/خواهرزاده' }, { en: 'Niece', fa: 'برادرزاده/خواهرزاده' },
                { en: 'Grandparents', fa: 'پدربزرگ و مادربزرگ' }, { en: 'Stepfather', fa: 'ناپدری' }, { en: 'Stepmother', fa: 'نامادری' },
                { en: 'Father-in-law', fa: 'پدرزن/پدرشوهر' }, { en: 'Mother-in-law', fa: 'مادرزن/مادرشوهر' }
            ],
            places: [
                { en: 'Hospital', fa: 'بیمارستان' }, { en: 'School', fa: 'مدرسه' }, { en: 'Park', fa: 'پارک' }, { en: 'Restaurant', fa: 'رستوران' },
                { en: 'Airport', fa: 'فرودگاه' }, { en: 'Bank', fa: 'بانک' }, { en: 'Library', fa: 'کتابخانه' }, { en: 'Supermarket', fa: 'سوپرمارکت' },
                { en: 'Cinema', fa: 'سینما' }, { en: 'Museum', fa: 'موزه' }, { en: 'Gym', fa: 'باشگاه' }, { en: 'Pharmacy', fa: 'داروخانه' },
                { en: 'Bakery', fa: 'نانوایی' }, { en: 'Coffee shop', fa: 'کافی‌شاپ' }, { en: 'Police station', fa: 'ایستگاه پلیس' },
                { en: 'Hotel', fa: 'هتل' }, { en: 'Gas station', fa: 'پمپ بنزین' }, { en: 'Beach', fa: 'ساحل' }, { en: 'Stadium', fa: 'استادیوم' },
                { en: 'University', fa: 'دانشگاه' }, { en: 'Zoo', fa: 'باغ وحش' }, { en: 'Theater', fa: 'تئاتر' }, { en: 'Post office', fa: 'اداره پست' }
            ],
            objects: [
                { en: 'Chair', fa: 'صندلی' }, { en: 'Table', fa: 'میز' }, { en: 'Pen', fa: 'خودکار' }, { en: 'Phone', fa: 'تلفن' },
                { en: 'Laptop', fa: 'لپ‌تاپ' }, { en: 'Key', fa: 'کلید' }, { en: 'Bottle', fa: 'بطری' }, { en: 'Bag', fa: 'کیف' },
                { en: 'Mirror', fa: 'آینه' }, { en: 'Clock', fa: 'ساعت' }, { en: 'Lamp', fa: 'لامپ' }, { en: 'Window', fa: 'پنجره' },
                { en: 'Door', fa: 'در' }, { en: 'Bed', fa: 'تخت خواب' }, { en: 'Spoon', fa: 'قاشق' }, { en: 'Fork', fa: 'چنگال' },
                { en: 'Knife', fa: 'چاقو' }, { en: 'Plate', fa: 'بشقاب' }, { en: 'Cup', fa: 'فنجان' }, { en: 'Glasses', fa: 'عینک' },
                { en: 'Wallet', fa: 'کیف پول' }, { en: 'Umbrella', fa: 'چتر' }, { en: 'Comb', fa: 'شانه' }, { en: 'Towel', fa: 'حوله' }
            ],
            clothes: [
                { en: 'Shirt', fa: 'پیراهن' }, { en: 'Pants', fa: 'شلوار' }, { en: 'Dress', fa: 'لباس زنانه' }, { en: 'Hat', fa: 'کلاه' },
                { en: 'Shoes', fa: 'کفش' }, { en: 'Socks', fa: 'جوراب' }, { en: 'Jacket', fa: 'کاپشن' }, { en: 'Coat', fa: 'کت' },
                { en: 'Skirt', fa: 'دامن' }, { en: 'Gloves', fa: 'دستکش' }, { en: 'Scarf', fa: 'شال گردن' }, { en: 'Tie', fa: 'کرافات' },
                { en: 'Belt', fa: 'کمربند' }, { en: 'Boots', fa: 'چکمه' }, { en: 'Sneakers', fa: 'کفش ورزشی' }, { en: 'Sweater', fa: 'پلیور' },
                { en: 'Suit', fa: 'کت و شلوار' }, { en: 'Uniform', fa: 'یونیفرم' }, { en: 'Jeans', fa: 'شلوار لی' }, { en: 'Raincoat', fa: 'بارانی' }
            ],
            adjectives: [
                { en: 'Big', fa: 'بزرگ' }, { en: 'Small', fa: 'کوچک' }, { en: 'Hot', fa: 'داغ' }, { en: 'Cold', fa: 'سرد' },
                { en: 'Happy', fa: 'خوشحال' }, { en: 'Sad', fa: 'غمگین' }, { en: 'Fast', fa: 'سریع' }, { en: 'Slow', fa: 'آهسته' },
                { en: 'New', fa: 'جدید' }, { en: 'Old', fa: 'قدیمی' }, { en: 'Beautiful', fa: 'زیبا' }, { en: 'Ugly', fa: 'زشت' },
                { en: 'Easy', fa: 'آسان' }, { en: 'Hard', fa: 'سخت' }, { en: 'Good', fa: 'خوب' }, { en: 'Bad', fa: 'بد' },
                { en: 'Rich', fa: 'پولدار' }, { en: 'Poor', fa: 'فقیر' }, { en: 'Strong', fa: 'قوی' }, { en: 'Weak', fa: 'ضعیف' }
            ],
            translate: [
                { en: 'Book', fa: 'کتاب' }, { en: 'Water', fa: 'آب' }, { en: 'Sun', fa: 'خورشید' }, { en: 'Moon', fa: 'ماه' },
                { en: 'Star', fa: 'ستاره' }, { en: 'Friend', fa: 'دوست' }, { en: 'School', fa: 'مدرسه' }, { en: 'House', fa: 'خانه' },
                { en: 'Bread', fa: 'نان' }, { en: 'Love', fa: 'عشق' }, { en: 'Time', fa: 'زمان' }, { en: 'Day', fa: 'روز' },
                { en: 'Night', fa: 'شب' }, { en: 'Earth', fa: 'زمین' }, { en: 'Forest', fa: 'جنگل' }, { en: 'Mountain', fa: 'کوه' },
                { en: 'Sea', fa: 'دریا' }, { en: 'River', fa: 'رودخانه' }, { en: 'Sky', fa: 'آسمان' }, { en: 'Rain', fa: 'باران' },
                { en: 'Snow', fa: 'برف' }, { en: 'Wind', fa: 'باد' }, { en: 'Fire', fa: 'آتش' }, { en: 'Tree', fa: 'درخت' },
                { en: 'Flower', fa: 'گل' }, { en: 'City', fa: 'شهر' }, { en: 'Village', fa: 'روستا' }, { en: 'Road', fa: 'جاده' },
                { en: 'Car', fa: 'ماشین' }, { en: 'Plane', fa: 'هواپیما' }, { en: 'Boat', fa: 'قایق' }, { en: 'Bicycle', fa: 'دوچرخه' },
                { en: 'Computer', fa: 'کامپیوتر' }, { en: 'Phone', fa: 'تلفن' }, { en: 'Clock', fa: 'ساعت' }, { en: 'Money', fa: 'پول' }
            ],
            sentences: [
                { words: ['I', 'am', 'a', 'student'], fa: 'من یک دانش‌آموز هستم' },
                { words: ['The', 'cat', 'is', 'sleeping'], fa: 'گربه در حال خوابیدن است' },
                { words: ['We', 'love', 'English'], fa: 'ما انگلیسی را دوست داریم' },
                { words: ['She', 'is', 'playing', 'football'], fa: 'او در حال فوتبال بازی کردن است' },
                { words: ['He', 'reads', 'a', 'big', 'book'], fa: 'او یک کتاب بزرگ می‌خواند' },
                { words: ['They', 'go', 'to', 'school', 'everyday'], fa: 'آن‌ها هر روز به مدرسه می‌روند' },
                { words: ['It', 'is', 'a', 'sunny', 'beautiful', 'day'], fa: 'امروز یک روز آفتابی زیباست' },
                { words: ['Learning', 'languages', 'is', 'very', 'exciting'], fa: 'یادگیری زبان‌ها بسیار هیجان‌انگیز است' },
                { words: ['Can', 'you', 'help', 'me', 'please'], fa: 'آیا می‌توانید به من کمک کنید لطفاً' },
                { words: ['I', 'want', 'to', 'drink', 'some', 'water'], fa: 'من می‌خواهم کمی آب بنوشم' },
                { words: ['Where', 'is', 'the', 'library'], fa: 'کتابخانه کجاست' },
                { words: ['My', 'brother', 'works', 'in', 'a', 'bank'], fa: 'برادر من در یک بانک کار می‌کند' },
                { words: ['The', 'birds', 'are', 'flying', 'in', 'the', 'sky'], fa: 'پرندگان در آسمان پرواز می‌کنند' },
                { words: ['She', 'has', 'a', 'red', 'dress'], fa: 'او یک لباس قرمز دارد' },
                { words: ['We', 'watch', 'TV', 'at', 'night'], fa: 'ما شب‌ها تلویزیون تماشا می‌کنیم' }
            ],
            grammar: [
                { words: ["She", "don't", "like", "apples."], wrongIdx: 1, correct: "doesn't", options: ["doesn't", "don't", "isn't", "doing"] },
                { words: ["He", "go", "to", "school."], wrongIdx: 1, correct: "goes", options: ["goes", "going", "gone", "goed"] },
                { words: ["They", "is", "happy."], wrongIdx: 1, correct: "are", options: ["are", "am", "was", "were"] },
                { words: ["I", "has", "a", "pen."], wrongIdx: 1, correct: "have", options: ["have", "had", "am having", "has"] },
                { words: ["We", "was", "at", "home."], wrongIdx: 1, correct: "were", options: ["were", "are", "been", "was"] },
                { words: ["She", "study", "every", "day."], wrongIdx: 1, correct: "studies", options: ["studies", "studying", "studied", "study"] },
                { words: ["It", "look", "good."], wrongIdx: 1, correct: "looks", options: ["looks", "look", "looking", "looked"] },
                { words: ["You", "am", "my", "friend."], wrongIdx: 1, correct: "are", options: ["are", "is", "am", "be"] },
                { words: ["Children", "is", "playing."], wrongIdx: 1, correct: "are", options: ["are", "was", "is", "be"] },
                { words: ["I", "sees", "the", "moon."], wrongIdx: 1, correct: "see", options: ["see", "saw", "seeing", "sees"] },
                { words: ["He", "never", "eat", "fish."], wrongIdx: 2, correct: "eats", options: ["eats", "ate", "eating", "eat"] },
                { words: ["They", "was", "very", "tired."], wrongIdx: 1, correct: "were", options: ["were", "are", "was", "been"] }
            ],
            hangman: [
                { word: 'GALAXY', hint: 'ستاره‌ها و سیارات' }, { word: 'PYTHON', hint: 'یک زبان برنامه‌نویسی' },
                { word: 'GUITAR', hint: 'ساز موسیقی' }, { word: 'ORANGE', hint: 'یک میوه نارنجی' },
                { word: 'COMPUTER', hint: 'دستگاه هوشمند' }, { word: 'AIRPLANE', hint: 'وسیله پرواز' },
                { word: 'KEYBOARD', hint: 'تایپ کردن' }, { word: 'MOUNTAIN', hint: 'بلندتر از تپه' },
                { word: 'LIBRARY', hint: 'محل کتاب‌ها' }, { word: 'DIAMOND', hint: 'سنگ قیمتی' },
                { word: 'UMBRELLA', hint: 'محافظ باران' }, { word: 'VOLCANO', hint: 'کوه آتش‌فشان' },
                { word: 'SUNGLASS', hint: 'محافظ چشم' }, { word: 'HOSPITAL', hint: 'محل درمان' }
            ]
        };
        return libraries[category] || [];
    }

    // --- GAME 1: WORD GUESSING ---
    renderGuessGame() {
        this.guessPool = [
            { img: 'apple.png', answer: 'APPLE' },
            { img: 'game_sentence.png', answer: 'PUZZLE' },
            { img: 'game_animal.png', answer: 'LION' },
            { img: 'game_job.png', answer: 'DOCTOR' },
            { img: 'game_color.png', answer: 'COLOR' }
        ];
        // Scale with level: more extra letters as levels go up
        const levelData = this.guessPool[this.currentLevel % this.guessPool.length];
        const extraDifficulty = Math.min(6, Math.floor(this.currentLevel / 5));
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let extras = "";
        for(let i=0; i<3+extraDifficulty; i++) extras += alphabet[Math.floor(Math.random()*26)];
        
        const html = `
            <div class="flex flex-col items-center space-y-8 animate__animated animate__fadeIn" dir="ltr">
                <div class="glass p-6 rounded-3xl shadow-2xl">
                    <img src="${levelData.img}" class="w-40 h-40 object-contain">
                </div>
                <div class="flex gap-2" id="answer-slots">
                    ${levelData.answer.split('').map(() => `<div onclick="window.app.undoLetter()" class="w-10 h-12 glass rounded-xl flex items-center justify-center text-xl font-bold border-b-4 border-blue-400 cursor-pointer hover:bg-white/10"></div>`).join('')}
                </div>
                <div class="grid grid-cols-6 gap-2" id="letter-pool">
                    ${this.shuffleString(levelData.answer + extras).split('').map(l => `<button class="letter-btn w-10 h-10 glass rounded-lg font-bold text-lg btn-hover" onclick="window.app.handleLetterClick(this, '${l}')">${l}</button>`).join('')}
                </div>
                <button onclick="window.app.undoLetter()" class="text-sm text-gray-400 underline mt-4">پاک کردن آخرین حرف</button>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
        this.currentGuess = "";
    }

    handleLetterClick(btn, char) {
        this.playSound('click');
        const slots = document.getElementById('answer-slots').children;
        const levelData = this.guessPool[this.currentLevel % this.guessPool.length];

        if (this.currentGuess.length < levelData.answer.length) {
            slots[this.currentGuess.length].innerText = char;
            this.currentGuess += char;
            btn.dataset.usedIdx = this.currentGuess.length - 1;
            btn.classList.add('opacity-30', 'pointer-events-none');

            if (this.currentGuess.length === levelData.answer.length) {
                if (this.currentGuess === levelData.answer) {
                    this.successAction(levelData.answer);
                } else {
                    this.failAction(levelData.answer);
                    setTimeout(() => this.renderLevel(), 2000);
                }
            }
        }
    }

    undoLetter() {
        if (this.currentGuess.length === 0) return;
        this.playSound('click');
        const lastIdx = this.currentGuess.length - 1;
        const slots = document.getElementById('answer-slots').children;
        slots[lastIdx].innerText = '';
        
        // Find the button that provided this letter
        const char = this.currentGuess[lastIdx];
        const buttons = document.querySelectorAll('.letter-btn');
        for (let btn of buttons) {
            if (btn.innerText === char && btn.dataset.usedIdx == lastIdx) {
                btn.classList.remove('opacity-30', 'pointer-events-none');
                delete btn.dataset.usedIdx;
                break;
            }
        }
        
        this.currentGuess = this.currentGuess.slice(0, -1);
    }

    // --- GAME 2: FAST TRANSLATE ---
    renderTranslateGame() {
        const timerBox = document.getElementById('timer-box');
        timerBox.classList.remove('hidden');
        const timeLimit = Math.max(3, 10 - Math.floor(this.currentLevel / 5));
        this.startTimer(timeLimit);

        const library = this.getVocabData('translate');
        const word = library[this.currentLevel % library.length];
        
        let options = [word.fa];
        while(options.length < 4) {
            const rand = library[Math.floor(Math.random() * library.length)].fa;
            if(!options.includes(rand)) options.push(rand);
        }
        this.shuffleArray(options);
        const correctIdx = options.indexOf(word.fa);

        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn">
                <div class="text-6xl font-bold mb-12 gradient-text" dir="ltr">${word.en}</div>
                <div class="grid grid-cols-1 gap-4 w-full max-w-xs" dir="rtl">
                    ${options.map((opt, i) => `
                        <button onclick="window.app.checkTranslate(${i}, ${correctIdx})" class="w-full glass py-4 rounded-2xl text-xl font-bold btn-hover block">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
    }

    checkTranslate(selected, correct) {
        this.stopTimer();
        const buttons = document.querySelectorAll('#game-content button');
        const correctText = buttons[correct].innerText;
        
        if (selected === correct) {
            this.successAction(correctText, 'fa-IR');
        } else {
            buttons[correct].classList.add('bg-green-500/50', 'border-green-400');
            this.failAction(correctText, 'fa-IR');
            setTimeout(() => this.renderLevel(), 2000);
        }
    }

    // --- GAME 3: SENTENCE BUILDER ---
    renderSentenceGame() {
        const pool = this.getVocabData('sentences');
        const data = pool[this.currentLevel % pool.length];
        const shuffled = [...data.words].sort(() => Math.random() - 0.5);
        
        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn">
                <div class="glass p-4 rounded-2xl mb-8 text-center w-full" dir="rtl">
                    <div class="text-gray-400 text-sm mb-2">ترجمه به انگلیسی:</div>
                    <div class="text-xl font-bold">${data.fa}</div>
                </div>
                <div id="sentence-target" dir="ltr" class="w-full min-h-[80px] glass rounded-2xl flex flex-wrap gap-2 p-4 mb-8 border-dashed border-2 border-white/20">
                </div>
                <div id="sentence-pool" dir="ltr" class="flex flex-wrap gap-3 justify-center">
                    ${shuffled.map(w => `<button onclick="window.app.moveWord(this)" class="word-chip glass px-4 py-2 rounded-xl text-lg font-medium">${w}</button>`).join('')}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
        this.constructedSentence = [];
        this.targetSentence = data.words;
    }

    moveWord(btn) {
        this.playSound('click');
        const target = document.getElementById('sentence-target');
        const word = btn.innerText;
        
        if (btn.parentElement.id === 'sentence-pool') {
            target.appendChild(btn);
            this.constructedSentence.push(word);
        } else {
            document.getElementById('sentence-pool').appendChild(btn);
            this.constructedSentence = this.constructedSentence.filter(w => w !== word);
        }

        if (this.constructedSentence.length === this.targetSentence.length) {
            const isCorrect = this.constructedSentence.every((w, i) => w === this.targetSentence[i]);
            const fullSentence = this.targetSentence.join(' ');
            if (isCorrect) {
                this.successAction(fullSentence);
            } else {
                this.failAction(fullSentence);
                setTimeout(() => this.renderLevel(), 2500);
            }
        }
    }

    // --- GAME 4: GRAMMAR CHECK ---
    renderGrammarGame() {
        const pool = this.getVocabData('grammar');
        this.currentGrammarData = pool[this.currentLevel % pool.length];
        this.grammarStep = 1;

        this.updateGrammarUI();
    }

    updateGrammarUI() {
        const data = this.currentGrammarData;
        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn">
                <div class="mb-8 text-center">
                    <div id="grammar-instruction" class="text-lg text-blue-300 mb-6" dir="rtl">
                        ${this.grammarStep === 1 ? '۱. اشتباه گرامری را در جمله لمس کنید:' : '۲. شکل صحیح آن را انتخاب کنید:'}
                    </div>
                    <div class="flex flex-wrap gap-2 justify-center mb-12" dir="ltr">
                        ${data.words.map((w, i) => `
                            <button id="gram-word-${i}" onclick="window.app.checkGrammarMistake(${i})" 
                                class="text-2xl font-bold p-2 hover:bg-white/10 rounded-lg transition-all ${this.grammarStep === 2 && i === data.wrongIdx ? 'bg-red-500/30 border-b-2 border-red-500' : ''}">
                                ${w}
                            </button>
                        `).join('')}
                    </div>

                    ${this.grammarStep === 2 ? `
                    <div class="grid grid-cols-2 gap-4 w-full max-w-xs animate__animated animate__bounceIn" dir="ltr">
                        ${this.shuffleArray([...data.options]).map(opt => `
                            <button onclick="window.app.checkGrammarCorrection('${opt.replace(/'/g, "\\'")}')" class="glass py-4 rounded-2xl text-lg font-bold btn-hover">
                                ${opt}
                            </button>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
    }

    checkGrammarMistake(idx) {
        if (this.grammarStep !== 1) return;
        this.playSound('click');
        if (idx === this.currentGrammarData.wrongIdx) {
            this.grammarStep = 2;
            this.updateGrammarUI();
        } else {
            this.failAction();
            gsap.to(`#gram-word-${idx}`, { x: 5, repeat: 3, yoyo: true, duration: 0.05 });
        }
    }

    checkGrammarCorrection(selected) {
        if (this.grammarStep !== 2) return;
        if (selected === this.currentGrammarData.correct) {
            this.successAction(this.currentGrammarData.words.join(' ').replace(this.currentGrammarData.words[this.currentGrammarData.wrongIdx], selected));
        } else {
            this.failAction(this.currentGrammarData.correct);
            setTimeout(() => this.renderLevel(), 2000);
        }
    }

    // --- GAME 5: HANGMAN ---
    renderHangmanGame() {
        const words = [
            { word: 'GALAXY', hint: 'ستاره‌ها و سیارات' },
            { word: 'PYTHON', hint: 'یک زبان برنامه‌نویسی' },
            { word: 'GUITAR', hint: 'ساز موسیقی' },
            { word: 'ORANGE', hint: 'یک میوه نارنجی' }
        ];
        const data = words[this.currentLevel % words.length];
        this.hangmanWord = data.word;
        this.guessedLetters = new Set();
        this.mistakes = 0;
        this.maxMistakes = 6;

        this.updateHangmanUI(data.hint);
    }

    updateHangmanUI(hint) {
        const displayWord = this.hangmanWord.split('').map(l => this.guessedLetters.has(l) ? l : '_').join(' ');
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
        
        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn" dir="ltr">
                <!-- Hangman Drawing -->
                <div class="w-32 h-32 mb-4 relative">
                    <svg viewBox="0 0 100 100" class="w-full h-full stroke-white fill-none stroke-[3]">
                        <!-- Gallows -->
                        <path d="M20,90 L80,90 M30,90 L30,10 L70,10 L70,25" stroke-opacity="0.3" />
                        <!-- Body Parts -->
                        <circle cx="70" cy="35" r="10" class="hangman-part ${this.mistakes >= 1 ? '' : 'hidden'}" /> <!-- Head -->
                        <line x1="70" y1="45" x2="70" y2="70" class="hangman-part ${this.mistakes >= 2 ? '' : 'hidden'}" /> <!-- Body -->
                        <line x1="70" y1="50" x2="55" y2="60" class="hangman-part ${this.mistakes >= 3 ? '' : 'hidden'}" /> <!-- L Arm -->
                        <line x1="70" y1="50" x2="85" y2="60" class="hangman-part ${this.mistakes >= 4 ? '' : 'hidden'}" /> <!-- R Arm -->
                        <line x1="70" y1="70" x2="55" y2="85" class="hangman-part ${this.mistakes >= 5 ? '' : 'hidden'}" /> <!-- L Leg -->
                        <line x1="70" y1="70" x2="85" y2="85" class="hangman-part ${this.mistakes >= 6 ? '' : 'hidden'}" /> <!-- R Leg -->
                    </svg>
                </div>

                <div class="text-sm text-gray-400 mb-2" dir="rtl">راهنما: ${hint}</div>
                <div class="text-4xl font-mono tracking-widest mb-10 text-blue-300">${displayWord}</div>
                
                <div class="grid grid-cols-7 gap-2 max-w-md">
                    ${alphabet.map(l => {
                        const used = this.guessedLetters.has(l);
                        return `<button 
                            onclick="window.app.guessHangman('${l}')" 
                            ${used ? 'disabled' : ''} 
                            class="w-10 h-10 glass rounded-lg font-bold flex items-center justify-center transition-all ${used ? 'opacity-20' : 'btn-hover'}"
                        >${l}</button>`;
                    }).join('')}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;

        if (!displayWord.includes('_')) {
            this.successAction(this.hangmanWord);
        } else if (this.mistakes >= this.maxMistakes) {
            this.failAction(this.hangmanWord);
            setTimeout(() => this.renderLevel(), 2000);
        }
    }

    guessHangman(letter) {
        this.playSound('click');
        this.guessedLetters.add(letter);
        if (!this.hangmanWord.includes(letter)) {
            this.mistakes++;
            this.playSound('fail');
        }
        const library = this.getVocabData('hangman');
        const data = library[this.currentLevel % library.length];
        this.updateHangmanUI(data.hint);
    }

    // --- NEW GAMES ---

    numberToWords(n) {
        const ones = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
        const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
        if (n < 1000) return ones[Math.floor(n / 100)] + " HUNDRED" + (n % 100 !== 0 ? " " + this.numberToWords(n % 100) : "");
        return n.toString();
    }

    renderNumToWordGame() {
        // Range increases with level up to 300+
        const range = Math.min(300, 20 + this.currentLevel);
        const val = Math.floor(Math.random() * range);
        const targetWord = this.numberToWords(val);
        
        let options = [targetWord];
        while(options.length < 4) {
            let rand = Math.floor(Math.random() * (range + 10));
            let opt = this.numberToWords(rand);
            if(!options.includes(opt)) options.push(opt);
        }
        this.shuffleArray(options);

        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn">
                <div class="text-7xl font-bold mb-12 gradient-text">${val}</div>
                <div class="grid grid-cols-1 gap-3 w-full max-w-xs" dir="ltr">
                    ${options.map(opt => `
                        <button onclick="window.app.checkChoice('${opt}', '${targetWord}')" class="glass py-3 rounded-2xl text-lg font-bold btn-hover">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
    }

    renderWordToNumGame() {
        const range = Math.min(300, 20 + this.currentLevel);
        const val = Math.floor(Math.random() * range);
        const targetWord = this.numberToWords(val);
        
        let options = [val];
        while(options.length < 4) {
            let rand = Math.floor(Math.random() * (range + 10));
            if(!options.includes(rand)) options.push(rand);
        }
        this.shuffleArray(options);

        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn">
                <div class="text-4xl font-bold mb-12 gradient-text text-center px-4" dir="ltr">${targetWord}</div>
                <div class="grid grid-cols-2 gap-4 w-full max-w-xs" dir="ltr">
                    ${options.map(opt => `
                        <button onclick="window.app.checkChoice(${opt}, ${val})" class="glass py-4 rounded-2xl text-xl font-bold btn-hover">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
    }

    renderColorsGame() {
        const colors = [
            { name: 'RED', hex: '#ef4444', fa: 'قرمز' },
            { name: 'BLUE', hex: '#3b82f6', fa: 'آبی' },
            { name: 'GREEN', hex: '#22c55e', fa: 'سبز' },
            { name: 'YELLOW', hex: '#eab308', fa: 'زرد' },
            { name: 'PURPLE', hex: '#a855f7', fa: 'بنفش' }
        ];
        const data = colors[this.currentLevel % colors.length];
        const options = this.shuffleArray([data.name, 'ORANGE', 'BLACK', 'WHITE', 'BROWN']).slice(0, 4);
        if (!options.includes(data.name)) options[0] = data.name;
        this.shuffleArray(options);

        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn">
                <div class="w-32 h-32 rounded-full mb-12 shadow-2xl border-4 border-white/20" style="background-color: ${data.hex}"></div>
                <div class="grid grid-cols-2 gap-4 w-full max-w-xs" dir="ltr">
                    ${options.map(opt => `
                        <button onclick="window.app.checkChoice('${opt}', '${data.name}')" class="glass py-4 rounded-2xl text-lg font-bold btn-hover">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
    }

    renderAnimalGame() {
        this.renderCategoryChoiceGame('animals', 'game_animal.png');
    }

    renderJobsGame() {
        this.renderCategoryChoiceGame('jobs', 'game_job.png');
    }

    renderDaysGame() {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        this.renderSequencePlacementGame(days, 'جاهای خالی روزهای هفته را پر کنید:', 'game_calendar.png');
    }

    renderMonthsGame() {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        this.renderSequencePlacementGame(months, 'جاهای خالی ماه‌های سال را پر کنید:', 'game_calendar.png', 'hue-rotate(45deg)');
    }

    renderSequencePlacementGame(fullList, title, icon = 'game_calendar.png', filter = '') {
        // Pick 4 random indices to hide
        let missingIndices = [];
        while(missingIndices.length < 4) {
            let r = Math.floor(Math.random() * fullList.length);
            if(!missingIndices.includes(r)) missingIndices.push(r);
        }
        missingIndices.sort((a,b) => a-b);
        
        const correctAnswers = missingIndices.map(i => fullList[i]);
        const shuffledPool = [...correctAnswers].sort(() => Math.random() - 0.5);

        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn">
                <div class="text-lg font-bold mb-4 text-blue-300" dir="rtl">${title}</div>
                
                <div id="sequence-display" dir="ltr" class="grid grid-cols-2 gap-2 w-full max-w-md mb-8">
                    ${fullList.map((item, idx) => {
                        if (missingIndices.includes(idx)) {
                            return `<div data-idx="${idx}" class="sequence-slot h-12 glass rounded-xl flex items-center justify-center border-2 border-dashed border-white/20 text-sm font-bold" onclick="window.app.removeFromSlot(this)"></div>`;
                        } else {
                            return `<div class="h-12 bg-white/5 rounded-xl flex items-center justify-center text-sm font-medium opacity-60">${item}</div>`;
                        }
                    }).join('')}
                </div>

                <div id="order-pool" dir="ltr" class="flex flex-wrap gap-2 justify-center mb-8">
                    ${shuffledPool.map(w => `<button onclick="window.app.placeInSlot(this)" class="word-chip glass px-4 py-2 rounded-xl text-sm font-bold">${w}</button>`).join('')}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
        this.targetSequence = correctAnswers;
        this.missingIndices = missingIndices;
        this.fullList = fullList;
    }

    placeInSlot(btn) {
        this.playSound('click');
        const slots = document.querySelectorAll('.sequence-slot');
        const emptySlot = Array.from(slots).find(s => s.innerText === "");
        if (emptySlot) {
            emptySlot.innerText = btn.innerText;
            emptySlot.classList.remove('border-dashed', 'border-white/20');
            emptySlot.classList.add('bg-blue-500/20', 'border-blue-400');
            btn.classList.add('hidden');
            this.checkSequenceStatus();
        }
    }

    removeFromSlot(slot) {
        if (slot.innerText === "") return;
        this.playSound('click');
        const val = slot.innerText;
        slot.innerText = "";
        slot.classList.add('border-dashed', 'border-white/20');
        slot.classList.remove('bg-blue-500/20', 'border-blue-400');
        
        const poolBtns = document.querySelectorAll('#order-pool button');
        for (let b of poolBtns) {
            if (b.innerText === val && b.classList.contains('hidden')) {
                b.classList.remove('hidden');
                break;
            }
        }
    }

    checkSequenceStatus() {
        const slots = document.querySelectorAll('.sequence-slot');
        const filled = Array.from(slots).every(s => s.innerText !== "");
        if (filled) {
            const isCorrect = Array.from(slots).every(s => {
                const idx = parseInt(s.dataset.idx);
                return s.innerText === this.fullList[idx];
            });

            if (isCorrect) {
                this.successAction();
            } else {
                this.failAction();
                setTimeout(() => this.renderLevel(), 2000);
            }
        }
    }

    renderFamilyGame() {
        this.renderCategoryChoiceGame('family', 'game_family.png');
    }

    renderPlacesGame() {
        this.renderCategoryChoiceGame('places', 'game_places.png');
    }

    renderAdjectivesGame() {
        this.renderCategoryChoiceGame('adjectives', 'game_adjectives.png');
    }

    renderObjectsGame() {
        this.renderCategoryChoiceGame('objects', 'game_objects.png');
    }

    renderClothesGame() {
        this.renderCategoryChoiceGame('clothes', 'game_clothes.png');
    }

    renderCategoryChoiceGame(category, icon, filter = '') {
        const library = this.getVocabData(category);
        const data = library[this.currentLevel % library.length];
        let options = [data.en];
        while(options.length < 4) {
            const opt = library[Math.floor(Math.random() * library.length)].en;
            if(!options.includes(opt)) options.push(opt);
        }
        this.shuffleArray(options);

        const html = `
            <div class="flex flex-col items-center w-full px-4 animate__animated animate__fadeIn">
                <div class="glass p-6 rounded-3xl mb-12">
                    <img src="${icon}" class="w-32 h-32 object-contain" style="filter: ${filter}">
                </div>
                <div class="text-3xl font-bold mb-8 text-blue-300" dir="rtl">معنی "${data.fa}":</div>
                <div class="grid grid-cols-2 gap-4 w-full max-w-xs" dir="ltr">
                    ${options.map(opt => `
                        <button onclick="window.app.checkChoice('${opt}', '${data.en}')" class="glass py-4 rounded-2xl text-lg font-bold btn-hover">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        document.getElementById('game-content').innerHTML = html;
    }

    checkChoice(selected, correct) {
        const buttons = document.querySelectorAll('#game-content button');
        let correctBtn;
        buttons.forEach(btn => {
            if (btn.innerText == correct) correctBtn = btn;
        });

        if (selected == correct) {
            this.successAction(correct.toString());
        } else {
            if (correctBtn) correctBtn.classList.add('bg-green-500/50', 'border-green-400');
            this.failAction(correct.toString());
            setTimeout(() => this.renderLevel(), 2000);
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    checkGrammar(idx, wrongIdx) {
        const buttons = document.querySelectorAll('#game-content button');
        const correctWord = buttons[wrongIdx].innerText;
        if (idx === wrongIdx) {
            this.successAction(correctWord);
        } else {
            buttons[wrongIdx].classList.add('text-green-400', 'underline');
            this.failAction(correctWord);
            setTimeout(() => this.renderLevel(), 2000);
        }
    }

    // --- UTILS ---
    startTimer(seconds) {
        this.timeLeft = seconds;
        const timerEl = document.getElementById('timer');
        timerEl.innerText = this.timeLeft;
        
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            timerEl.innerText = this.timeLeft;
            if (this.timeLeft <= 0) {
                this.stopTimer();
                this.failAction();
                setTimeout(() => this.renderLevel(), 1000);
            }
        }, 1000);
    }

    stopTimer() {
        clearInterval(this.timerInterval);
    }

    successAction(answerText = "", lang = 'en-US') {
        this.playSound('success');
        this.score += 10;
        document.getElementById('score').innerText = this.score;
        this.showFeedback('✅', answerText);
        
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });

        this.currentLevel++;
        
        if (!this.progress[this.currentGame]) {
            this.progress[this.currentGame] = { level: 0, medals: 0, completed: false };
        }
        this.progress[this.currentGame].level = this.currentLevel;

        const nextLevel = () => {
            if (this.currentLevel >= this.maxLevels) {
                this.progress[this.currentGame].medals = (this.progress[this.currentGame].medals || 0) + 1;
                this.progress[this.currentGame].completed = true;
                this.progress[this.currentGame].level = 0;
                this.saveProgress();
                this.updateMenuUI();
                setTimeout(() => this.showMenu(), 1000);
            } else {
                this.saveProgress();
                this.updateMenuUI();
                this.renderLevel();
            }
        };

        const isLongSequence = (this.currentGame === GAME_TYPES.DAYS || this.currentGame === GAME_TYPES.MONTHS);

        if (answerText && isLongSequence) {
            // No speaking for days/months as requested
            setTimeout(nextLevel, 1500);
        } else {
            if (answerText) this.speak(answerText, lang);
            setTimeout(nextLevel, 2000);
        }
    }

    failAction(correctAnswer = "", lang = 'en-US') {
        this.playSound('fail');
        this.showFeedback('❌', correctAnswer);
        const isLongSequence = (this.currentGame === GAME_TYPES.DAYS || this.currentGame === GAME_TYPES.MONTHS);
        if (correctAnswer && !isLongSequence) {
            this.speak(`No, it is ${correctAnswer}`, lang);
            const display = document.getElementById('correct-answer-display');
            if (display) {
                display.innerText = `درست: ${correctAnswer}`;
                display.classList.remove('hidden');
            }
        }
        gsap.to('#game-content', { x: 10, repeat: 5, yoyo: true, duration: 0.05, onComplete: () => {
            gsap.set('#game-content', { x: 0 });
        }});
    }

    showFeedback(symbol, text = "") {
        const fb = document.getElementById('feedback');
        const icon = document.getElementById('feedback-icon');
        icon.innerHTML = `<div class="flex flex-col items-center">
            <span>${symbol}</span>
            ${text ? `<span class="text-2xl mt-4 font-bold bg-black/40 px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md">${text}</span>` : ''}
        </div>`;
        fb.classList.remove('opacity-0');
        fb.style.pointerEvents = 'auto';
        gsap.fromTo(icon, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out', onComplete: () => {
            gsap.to(icon, { opacity: 0, scale: 1.5, duration: 0.5, delay: 1.2, onComplete: () => {
                fb.classList.add('opacity-0');
                fb.style.pointerEvents = 'none';
            }});
        }});
    }

    shuffleString(str) {
        return str.split('').sort(() => Math.random() - 0.5).join('');
    }
}

window.app = new App();