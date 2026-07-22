import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        
        let auth = null;
        let currentUser = null;
        let db = null;
        let unsubscribeCards = null;
        let currentCardsData = [];
        let editingId = null;
        
        
        let printQueue = [];

        
        const GRADE_COLORS = {
            high3: { hex: '#c85a17', rgb: '200, 90, 23' },    
            high2: { hex: '#b38000', rgb: '179, 128, 0' },    
            high1: { hex: '#a31f34', rgb: '163, 31, 52' },    
            mid3:  { hex: '#1b4f93', rgb: '27, 79, 147' },    
            mid2:  { hex: '#1e6b47', rgb: '30, 107, 71' },    
            mid1:  { hex: '#5c2d91', rgb: '92, 45, 145' },    
        };

        const FIELD_ICONS = {
            '照明': 'fa-lightbulb',
            '放送': 'fa-satellite-dish',
            '朗読': 'fa-book-open',
            'アナウンス': 'fa-microphone-alt',
            '映像': 'fa-video',
            '音声': 'fa-headphones',
        };

        const LOGO_URL = "https://ataro-qqq.github.io/cardmaker26/YSBC-rogo.png";

        
        const formInputs = ['in-name', 'in-spell', 'in-grade', 'in-class', 'in-birth', 'in-role', 'in-spot', 'in-field'].map(id => document.getElementById(id));
        const a4Container = document.getElementById('a4-container');
        const savedListEl = document.getElementById('saved-list');
        const saveCountEl = document.getElementById('save-count');
        const btnSave = document.getElementById('btn-save');
        const btnClear = document.getElementById('btn-clear');
        const authStatusEl = document.getElementById('auth-status');
        const authModal = document.getElementById('auth-modal');
        const authForm = document.getElementById('auth-form');
        const btnRegister = document.getElementById('btn-register');
        const authErrorMsg = document.getElementById('auth-error-msg');
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');

        
        async function initFirebase() {
            showLoading("初期化中...");
            try {
                const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { projectId: "demo-app" };
                const app = initializeApp(firebaseConfig);
                auth = getAuth(app);
                db = getFirestore(app);

                onAuthStateChanged(auth, (user) => {
                    currentUser = user;
                    if (user) {
                        const emailDisplay = user.email ? user.email.split('@')[0] : user.uid.substring(0, 6);
                        authStatusEl.innerHTML = `
                            <span class="flex items-center space-x-1">
                                <i class="fas fa-check-circle text-emerald-400"></i>
                                <span>${emailDisplay}</span>
                                <button onclick="window.logoutUser()" class="ml-1.5 text-slate-400 hover:text-white underline text-[10px]">ログアウト</button>
                            </span>
                        `;
                        authModal.classList.add('hidden');
                        setupRealtimeListener();
                    } else {
                        authStatusEl.innerHTML = `<i class="fas fa-lock text-amber-400"></i> 未ログイン`;
                        authModal.classList.remove('hidden');
                        if(unsubscribeCards) unsubscribeCards();
                        currentCardsData = [];
                        renderSavedList();
                    }
                });

            } catch (e) {
                console.error("Firebase Auth error:", e);
                authStatusEl.innerText = "認証エラー";
            } finally {
                hideLoading();
            }
        }

        
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            authErrorMsg.classList.add('hidden');
            showLoading("ログイン中...");

            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (err) {
                console.error("Login failed:", err);
                authErrorMsg.innerText = "ログインに失敗しました。メールアドレスまたはパスワードを確認してください。";
                authErrorMsg.classList.remove('hidden');
            } finally {
                hideLoading();
            }
        });

        btnRegister.addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            authErrorMsg.classList.add('hidden');

            if(!email || !password || password.length < 6) {
                authErrorMsg.innerText = "有効なメールアドレスと、6文字以上のパスワードを入力してください。";
                authErrorMsg.classList.remove('hidden');
                return;
            }

            showLoading("アカウント作成中...");
            try {
                await createUserWithEmailAndPassword(auth, email, password);
                alertUI("アカウントを作成してログインしました！", true);
            } catch (err) {
                console.error("Registration failed:", err);
                authErrorMsg.innerText = "アカウント作成に失敗しました。既存のメールアドレスか無効な形式です。";
                authErrorMsg.classList.remove('hidden');
            } finally {
                hideLoading();
            }
        });

        window.logoutUser = () => {
            signOut(auth);
            alertUI("ログアウトしました");
        };

        function getCollectionRef() {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            return collection(db, 'artifacts', appId, 'users', currentUser.uid, 'cards');
        }

        function setupRealtimeListener() {
            if (!currentUser) return;
            if (unsubscribeCards) unsubscribeCards();

            const colRef = getCollectionRef();
            unsubscribeCards = onSnapshot(colRef, (snapshot) => {
                currentCardsData = [];
                snapshot.forEach(doc => {
                    currentCardsData.push({ id: doc.id, ...doc.data() });
                });
                renderSavedList();
            }, (error) => {
                console.error("Firestore listener error:", error);
            });
        }

        async function saveCurrentCard() {
            if (!currentUser) {
                alertUI("ログインが必要です。");
                return;
            }
            
            const data = getFormData();
            if (!data.name.trim()) {
                alertUI("氏名を入力してください。");
                return;
            }

            try {
                showLoading("保存中...");
                const colRef = getCollectionRef();
                
                if (!editingId && currentCardsData.length >= 5) {
                    alertUI("保存できるのは最大5データまでです。既存のデータを削除してください。");
                    hideLoading();
                    return;
                }

                const docId = editingId || 'card_' + Date.now();
                const docRef = doc(colRef, docId);
                
                await setDoc(docRef, {
                    ...data,
                    updatedAt: new Date().toISOString()
                });
                
                editingId = docId;
                alertUI("データを保存しました", true);
                
            } catch (e) {
                console.error("Save error:", e);
                alertUI("保存処理に失敗しました。");
            } finally {
                hideLoading();
            }
        }

        async function deleteCard(id) {
            if (!currentUser) return;
            try {
                showLoading("削除中...");
                const colRef = getCollectionRef();
                await deleteDoc(doc(colRef, id));
                if (editingId === id) {
                    clearForm();
                }
            } catch (e) {
                console.error("Delete error:", e);
                alertUI("削除処理に失敗しました。");
            } finally {
                hideLoading();
            }
        }

        
        function getFormData() {
            return {
                name: document.getElementById('in-name').value,
                spell: document.getElementById('in-spell').value,
                grade: document.getElementById('in-grade').value,
                className: document.getElementById('in-class').value,
                birth: document.getElementById('in-birth').value,
                role: document.getElementById('in-role').value,
                spot: document.getElementById('in-spot').value,
                field: document.getElementById('in-field').value,
            };
        }

        function setFormData(data, id = null) {
            editingId = id;
            document.getElementById('in-name').value = data.name || '';
            document.getElementById('in-spell').value = data.spell || '';
            document.getElementById('in-grade').value = data.grade || 'high2';
            document.getElementById('in-class').value = data.className || '';
            document.getElementById('in-birth').value = data.birth || '';
            document.getElementById('in-role').value = data.role || '';
            document.getElementById('in-spot').value = data.spot || 'センター';
            document.getElementById('in-field').value = data.field || 'アナウンス';
            renderSinglePreview();
        }

        function clearForm() {
            editingId = null;
            document.getElementById('in-name').value = '';
            document.getElementById('in-spell').value = '';
            document.getElementById('in-role').value = '';
            renderSinglePreview();
        }

        
        function generateCardHTML(data) {
            const hasRole = data.role && data.role.trim() !== '';
            const gradeColorInfo = GRADE_COLORS[data.grade] || GRADE_COLORS.high2;
            const themeColor = gradeColorInfo.hex;
            const themeRgb = gradeColorInfo.rgb;
            const iconClass = FIELD_ICONS[data.field] || 'fa-star';
            
            const leftBgColor = hasRole ? '#1e293b' : themeColor;
            
            const rightBgStyle = hasRole 
                ? `background-color: ${themeColor}; color: #ffffff;` 
                : `background-color: #ffffff; color: #0f172a;`;

            const roleBadgeStyle = hasRole 
                ? `background-color: #ffffff; color: ${themeColor}; border-color: #ffffff;` 
                : `color: ${themeColor}; border-color: ${themeColor}; background-color: transparent;`;

            const iconCircleStyle = hasRole
                ? `color: #1e293b;`
                : `color: ${themeColor};`;
                
            const lineStyle = hasRole
                ? `background: linear-gradient(90deg, #ffffff 0%, rgba(255,255,255,0.1) 100%);`
                : `background: linear-gradient(90deg, ${themeColor} 0%, rgba(${themeRgb}, 0.1) 100%);`;

            return `
                <div class="business-card">
                    <div class="digital-bg"></div>
                    <div class="digital-accent-circle"></div>
                    
                    <!-- Left Side -->
                    <div class="card-left" style="background-color: ${leftBgColor};">
                        <div class="icon-circle" style="${iconCircleStyle}">
                            <i class="fas ${iconClass}"></i>
                        </div>
                        <img src="${LOGO_URL}" class="ysbc-logo" alt="YSBC Logo" onerror="this.style.opacity='0'">
                    </div>

                    <!-- Right Side -->
                    <div class="card-right ${hasRole ? 'has-role' : ''}" style="${rightBgStyle}">
                        <div class="header-row">
                            <div class="school-info">
                                横浜創英中学高等学校　放送部
                            </div>
                            <div class="role-badge" style="${roleBadgeStyle}">
                                ${data.role || '一般'}
                            </div>
                        </div>

                        <div class="name-container">
                            <div class="name">${data.name || '姓名 未入力'}</div>
                            <div class="spell">${data.spell || ''}</div>
                        </div>

                        <div class="digital-line" style="${lineStyle}"></div>

                        <div class="details-grid">
                            <div class="detail-item">
                                <span class="detail-label">CLASS</span>
                                <span>${data.className || '―'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">BIRTH</span>
                                <span>${data.birth || '―'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">SPOT</span>
                                <span>${data.spot || '―'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        
        function renderSinglePreview() {
            const data = getFormData();
            document.getElementById('single-preview').innerHTML = generateCardHTML(data);
        }

        function renderA4Sheet() {
            let html = '';
            for (let i = 0; i < 10; i++) {
                if (i < printQueue.length) {
                    const cardData = printQueue[i];
                    html += `
                        <div class="card-wrapper">
                            ${generateCardHTML(cardData)}
                            <div class="card-remove-btn print-hidden" onclick="window.removeFromPrint(${i})" title="シートから外す">
                                <i class="fas fa-times text-sm"></i>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="empty-slot">
                            <span class="print-hidden">空き枠 (${i + 1}/10)</span>
                        </div>
                    `;
                }
            }
            a4Container.innerHTML = html;
        }

        
        window.addToPrint = () => {
            if (printQueue.length >= 10) {
                alertUI("印刷シートは10枚で満杯です。");
                return;
            }
            printQueue.push(getFormData());
            renderA4Sheet();
            alertUI("シートに追加しました！", true);
        };

        window.fillPrint = () => {
            const data = getFormData();
            const remaining = 10 - printQueue.length;
            if (remaining === 0) {
                alertUI("印刷シートはすでに満杯です。");
                return;
            }
            for (let i = 0; i < remaining; i++) {
                printQueue.push(data);
            }
            renderA4Sheet();
            alertUI(`残りの枠(${remaining}枚)を埋めました！`, true);
        };

        window.removeFromPrint = (index) => {
            printQueue.splice(index, 1);
            renderA4Sheet();
        };

        window.clearPrintQueue = () => {
            if(printQueue.length === 0) return;
            printQueue = [];
            renderA4Sheet();
            alertUI("印刷シートをクリアしました", true);
        };

        function renderSavedList() {
            saveCountEl.innerText = currentCardsData.length;
            
            if (currentCardsData.length === 0) {
                savedListEl.innerHTML = '<div class="text-xs text-gray-400 italic py-1">保存されたデータはありません</div>';
                return;
            }

            savedListEl.innerHTML = currentCardsData.map(card => {
                const isEditing = editingId === card.id;
                const bgClass = isEditing ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-slate-100';
                
                return `
                    <div class="flex justify-between items-center p-2 border rounded ${bgClass} transition">
                        <div class="cursor-pointer flex-1 overflow-hidden" onclick="window.loadCard('${card.id}')">
                            <div class="text-xs font-bold text-slate-800 truncate">${card.name}</div>
                            <div class="text-[10px] text-slate-500">${card.role || '一般'} / ${card.spot}</div>
                        </div>
                        <button onclick="window.deleteCardBtn('${card.id}')" class="text-slate-400 hover:text-red-500 p-1.5 ml-1 transition" title="削除">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }

        
        function showLoading(msg) {
            loadingText.innerText = msg;
            loadingOverlay.classList.remove('hidden');
        }
        function hideLoading() {
            loadingOverlay.classList.add('hidden');
        }
        function alertUI(msg, isSuccess = false) {
            const el = document.createElement('div');
            const bgColor = isSuccess ? 'bg-emerald-600' : 'bg-slate-900';
            el.className = `fixed top-5 left-1/2 transform -translate-x-1/2 ${bgColor} text-white text-xs font-bold px-6 py-3 rounded-full shadow-2xl z-50 transition-all duration-300 pointer-events-none`;
            el.innerText = msg;
            document.body.appendChild(el);
            setTimeout(() => {
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 300);
            }, 2000);
        }

        
        formInputs.forEach(input => {
            if(input) {
                input.addEventListener('input', renderSinglePreview);
                input.addEventListener('change', renderSinglePreview);
            }
        });

        btnSave.addEventListener('click', saveCurrentCard);
        btnClear.addEventListener('click', clearForm);

        
        window.loadCard = (id) => {
            const card = currentCardsData.find(c => c.id === id);
            if (card) setFormData(card, id);
        };
        window.deleteCardBtn = (id) => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4';
            overlay.innerHTML = `
                <div class="bg-white p-5 rounded-lg shadow-xl text-center max-w-xs w-full">
                    <p class="text-xs font-bold text-slate-800 mb-4">このデータをクラウドから削除しますか？</p>
                    <div class="flex justify-center space-x-2">
                        <button id="conf-no" class="px-4 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded hover:bg-slate-200">キャンセル</button>
                        <button id="conf-yes" class="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700">削除する</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            
            document.getElementById('conf-no').onclick = () => overlay.remove();
            document.getElementById('conf-yes').onclick = () => {
                overlay.remove();
                deleteCard(id);
            };
        };

        
        renderSinglePreview();
        renderA4Sheet();
        initFirebase();
