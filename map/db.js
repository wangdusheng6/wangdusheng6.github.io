// ---------- 初始化数据库 (IndexedDB 存储账号及绘图数据) ----------
        const DB_NAME = 'WorldMapDB';
        const DB_VERSION = 5;
        const USERS_STORE = 'users';
        const DRAFT_STORE = 'drafts'; // 存储用户的绘图canvas数据 (base64)

        let db = null;

        // ----- 数据库操作封装 -----
        function openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    db = request.result;
                    resolve(db);
                };
                request.onupgradeneeded = (event) => {
                    const dbRef = event.target.result;
                    
                    // users 表
                    if (!dbRef.objectStoreNames.contains(USERS_STORE)) {
                        const userStore = dbRef.createObjectStore(USERS_STORE, { keyPath: 'accountId' });
                        userStore.createIndex('wechat', 'wechat', { unique: false });
                    }
                    
                    // drafts 表
                    if (!dbRef.objectStoreNames.contains(DRAFT_STORE)) {
                        dbRef.createObjectStore(DRAFT_STORE, { keyPath: 'accountId' });
                    }
                    
                    // textmarkers 表
                    if (!dbRef.objectStoreNames.contains('textmarkers')) {
                        dbRef.createObjectStore('textmarkers', { keyPath: 'accountId' });
                    }
                    
                    // markers 表（重要！）
                    if (!dbRef.objectStoreNames.contains('markers')) {
                        dbRef.createObjectStore('markers', { keyPath: 'accountId' });
                    }
                    
                    // archives 表
                    if (!dbRef.objectStoreNames.contains('archives')) {
                        const archiveStore = dbRef.createObjectStore('archives', { keyPath: 'archiveId' });
                        archiveStore.createIndex('accountId', 'accountId', { unique: false });
                    }
                };
            });
        }

        // 生成10位数字ID
        function generateAccountId() {
            return Math.floor(1000000000 + Math.random() * 9000000000).toString();
        }
        
        // 注册账号
        async function registerUser(username, password, wechat) {
            if (!username || !password || !wechat) throw new Error('请填写完整信息');
            const accountId = generateAccountId();
            const user = { accountId, username, password, wechat, createTime: Date.now() };
            const tx = db.transaction([USERS_STORE], 'readwrite');
            const store = tx.objectStore(USERS_STORE);
            // 检查用户名是否已存在 (可选，简单检查重复用户名)
            const existing = await new Promise((res) => {
                const index = store.index('wechat');
                const req = index.get(wechat);
                req.onsuccess = () => res(req.result);
                req.onerror = () => res(null);
            });
            if (existing) throw new Error('该微信号已注册');
            await new Promise((res, rej) => {
                const req = store.add(user);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
            return { accountId, username, wechat };
        }
        
        // 登录验证 - 通过用户名
        async function loginByUsername(username, password) {
            const tx = db.transaction([USERS_STORE], 'readonly');
            const store = tx.objectStore(USERS_STORE);
            let user = null;
            await new Promise((res) => {
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (cursor.value.username === username) {
                            user = cursor.value;
                            res();
                            return;
                        }
                        cursor.continue();
                    } else {
                        res();
                    }
                };
            });
            if (!user) throw new Error('账号不存在');
            if (user.password !== password) throw new Error('密码错误');
            return user;
        }
        
        // 通过微信号找回密码
        async function recoverPassword(wechat) {
            const tx = db.transaction([USERS_STORE], 'readonly');
            const store = tx.objectStore(USERS_STORE);
            const index = store.index('wechat');
            const user = await new Promise((res) => {
                const req = index.get(wechat);
                req.onsuccess = () => res(req.result);
                req.onerror = () => res(null);
            });
            if (!user) throw new Error('未找到该微信号绑定的账号');
            return user.password;
        }
        
        // 更改密码
        async function changePassword(accountId, oldPassword, newPassword) {
            const tx = db.transaction([USERS_STORE], 'readwrite');
            const store = tx.objectStore(USERS_STORE);
            const user = await new Promise((res) => {
                const req = store.get(accountId);
                req.onsuccess = () => res(req.result);
            });
            if (!user) throw new Error('账号不存在');
            if (user.password !== oldPassword) throw new Error('原密码错误');
            user.password = newPassword;
            await new Promise((res, rej) => {
                const req = store.put(user);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
            return true;
        }

// 注销账号（永久删除）- 接收参数版本
async function deleteAccount(accountId, password) {
    // 先验证密码
    const tx1 = db.transaction([USERS_STORE], 'readonly');
    const store1 = tx1.objectStore(USERS_STORE);
    const user = await new Promise((resolve) => {
        const req = store1.get(accountId);
        req.onsuccess = () => resolve(req.result);
    });
    
    if (!user) throw new Error('账号不存在');
    if (user.password !== password) throw new Error('密码错误');
    
    // 删除用户数据
    const storesToDelete = [USERS_STORE, DRAFT_STORE, 'textmarkers', 'markers', 'archives'];
    
    for (const storeName of storesToDelete) {
        if (db.objectStoreNames.contains(storeName)) {
            const tx = db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            await new Promise((resolve) => {
                const req = store.delete(accountId);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
            });
        }
    }
    
    return true;
}
        // 保存绘图数据 (canvas base64)
        async function saveDraft(accountId, imageDataUrl) {
            const tx = db.transaction([DRAFT_STORE], 'readwrite');
            const store = tx.objectStore(DRAFT_STORE);
            const draft = { accountId, imageDataUrl, updatedAt: Date.now() };
            await new Promise((res, rej) => {
                const req = store.put(draft);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
        }
        async function loadDraft(accountId) {
            const tx = db.transaction([DRAFT_STORE], 'readonly');
            const store = tx.objectStore(DRAFT_STORE);
            const draft = await new Promise((res) => {
                const req = store.get(accountId);
                req.onsuccess = () => res(req.result);
            });
            return draft ? draft.imageDataUrl : null;
        }

        async function saveTextMarkers(accountId, markers) {
            if (!db.objectStoreNames.contains('textmarkers')) return;
            const tx = db.transaction(['textmarkers'], 'readwrite');
            const store = tx.objectStore('textmarkers');
            await store.put({ accountId, markers });
        }

        async function loadTextMarkers(accountId) {
            if (!db.objectStoreNames.contains('textmarkers')) return [];
            const tx = db.transaction(['textmarkers'], 'readonly');
            const store = tx.objectStore('textmarkers');
            const res = await new Promise(res => {
                const req = store.get(accountId);
                req.onsuccess = () => res(req.result);
            });
            return res ? res.markers : [];
        }
        
        async function saveMarkers(accountId, markers) {
            const tx = db.transaction(['markers'], 'readwrite');
            if(!db.objectStoreNames.contains('markers')) return;
            const store = tx.objectStore('markers');
            await store.put({accountId, markers});
        }
        async function loadMarkers(accountId) {
            if(!db.objectStoreNames.contains('markers')) return [];
            const tx = db.transaction(['markers'], 'readonly');
            const store = tx.objectStore('markers');
            const res = await new Promise(res => { const req = store.get(accountId); req.onsuccess=()=>res(req.result); });
            return res ? res.markers : [];
        }

        // 生成存档ID
        function generateArchiveId() {
            return 'archive_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        }

        // 保存存档
        async function saveArchive(accountId, name, iconDataUrl, mapDataUrl, markers, textMarkers) {
            if (!db.objectStoreNames.contains('archives')) {
                throw new Error('archives 存储不存在');
            }
            const tx = db.transaction(['archives'], 'readwrite');
            const store = tx.objectStore('archives');
            const archiveId = generateArchiveId();
            const archive = {
                archiveId,
                accountId,
                name,
                iconDataUrl: iconDataUrl || null,  // ← 修正：使用传入的图标
                mapDataUrl,
                markers: markers || [],
                textMarkers: textMarkers || [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            await new Promise((res, rej) => {
                const req = store.add(archive);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
            return archive;
        }

        // 获取用户的所有存档
        async function getUserArchives(accountId) {
            if (!db.objectStoreNames.contains('archives')) {
                return [];
            }
            const tx = db.transaction(['archives'], 'readonly');
            const store = tx.objectStore('archives');
            const archives = [];
            await new Promise((res) => {
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (cursor.value.accountId === accountId) {
                            archives.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        res();
                    }
                };
            });
            return archives.sort((a, b) => b.updatedAt - a.updatedAt);
        }

        // 删除存档
        async function deleteArchive(archiveId) {
            if (!db.objectStoreNames.contains('archives')) {
                throw new Error('archives 存储不存在');
            }
            const tx = db.transaction(['archives'], 'readwrite');
            const store = tx.objectStore('archives');
            await new Promise((res, rej) => {
                const req = store.delete(archiveId);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
        }

// 获取单个存档
async function getArchive(archiveId) {
    if (!db.objectStoreNames.contains('archives')) return null;
    const tx = db.transaction(['archives'], 'readonly');
    const store = tx.objectStore('archives');
    return await new Promise((resolve) => {
        const req = store.get(archiveId);
        req.onsuccess = () => resolve(req.result);
    });
}

// 更新存档
async function updateArchive(archiveId, updates) {
    if (!db.objectStoreNames.contains('archives')) {
        throw new Error('archives 存储不存在');
    }
    const archive = await getArchive(archiveId);
    if (!archive) throw new Error('存档不存在');
    Object.assign(archive, updates, { updatedAt: Date.now() });
    const tx = db.transaction(['archives'], 'readwrite');
    const store = tx.objectStore('archives');
    await new Promise((resolve, reject) => {
        const req = store.put(archive);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
    return archive;
}

// 复制存档
async function duplicateArchive(archiveId, newName) {
    if (!db.objectStoreNames.contains('archives')) {
        throw new Error('archives 存储不存在');
    }
    const tx = db.transaction(['archives'], 'readonly');
    const store = tx.objectStore('archives');
    const archive = await new Promise((res) => {
        const req = store.get(archiveId);
        req.onsuccess = () => res(req.result);
    });
    if (!archive) throw new Error('存档不存在');
    
    const newArchive = {
        archiveId: generateArchiveId(),
        accountId: archive.accountId,
        name: newName,
        data: archive.data,
        mapDataUrl: archive.mapDataUrl,
        markers: JSON.parse(JSON.stringify(archive.markers || [])),
        textMarkers: JSON.parse(JSON.stringify(archive.textMarkers || [])),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        iconDataUrl: archive.iconDataUrl
    };
    
    const writeTx = db.transaction(['archives'], 'readwrite');
    const writeStore = writeTx.objectStore('archives');
    await new Promise((res, rej) => {
        const req = writeStore.add(newArchive);
        req.onsuccess = () => res();
        req.onerror = () => rej(req.error);
    });
    return newArchive;
}


        // ========== 导出所有函数 ==========
export function getDB() {
    return db;
}

export {
    openDB,
    registerUser,
    loginByUsername,
    recoverPassword,
    changePassword,
    deleteAccount,
    saveDraft,
    loadDraft,
    saveTextMarkers,
    loadTextMarkers,
    saveMarkers,
    loadMarkers,
    saveArchive,
    getUserArchives,
    getArchive,
    updateArchive,
    deleteArchive,
    duplicateArchive
};