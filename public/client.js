// chat-app/public/client.js

const socket = io();

// الحصول على عناصر DOM
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container'); // main-app-container

const registerForm = document.getElementById('register-form');
const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const registerMessage = document.getElementById('register-message');

const loginForm = document.getElementById('login-form');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginMessage = document.getElementById('login-message');

const form = document.getElementById('form');
const input = document.getElementById('input'); // حقل إدخال الرسالة
const messages = document.getElementById('messages'); // قائمة الرسائل
const currentUsernameSpan = document.getElementById('current-username-sidebar');
const logoutButton = document.getElementById('logout-button');

const conversationsList = document.getElementById('conversations-list');

// عناصر لوظيفة البحث الجديدة
const searchConversationsInput = document.getElementById('search-conversations-input');


// عناصر لوحة مفاتيح الرموز التعبيرية
const emojiButton = document.getElementById('emoji-button');
const emojiPicker = document.getElementById('emoji-picker');

// عناصر المودال الجديدة لإنشاء المحادثات
const newConversationFab = document.getElementById('new-conversation-fab'); // زر الإنشاء العائم
const newConversationModal = document.getElementById('new-conversation-modal'); // نافذة المودال
const closeModalButton = document.getElementById('close-modal-button'); // زر إغلاق المودال
const showGroupFormButton = document.getElementById('show-group-form-button'); // زر خيار "إنشاء مجموعة"
const showPrivateFormButton = document.getElementById('show-private-form-button'); // زر خيار "محادثة فردية"
const groupFormContainer = document.getElementById('group-form-container'); // حاوية نموذج المجموعة
const privateFormContainer = document.getElementById('private-form-container'); // حاوية نموذج الفردية
const modalMessage = document.getElementById('modal-message'); // رسالة داخل المودال

// نماذج الإنشاء الفعلية داخل المودال (التي كانت منفصلة سابقاً)
const modalCreateGroupChatForm = document.getElementById('modal-create-group-chat-form');
const modalGroupChatNameInput = document.getElementById('modal-group-chat-name');
const modalGroupParticipantsInput = document.getElementById('modal-group-participants');

const modalStartPrivateChatForm = document.getElementById('modal-start-private-chat-form');
const modalPrivateChatUsernameInput = document.getElementById('modal-private-chat-username');


const chatAreaHeader = document.getElementById('chat-area-header');
const chatAreaContainer = document.getElementById('chat-area-container');

let loggedInUsername = '';
let currentConversationId = null;

// لتتبع حالة الاتصال للمستخدمين في الواجهة الأمامية
const usersOnlineStatus = new Map(); // Stores userId -> isOnline (true/false)


// --- دوال مساعدة ---

function displayMessage(element, text, type) {
    element.textContent = text;
    element.className = 'message ' + type;
    setTimeout(() => {
        element.textContent = '';
        element.className = 'message';
    }, 5000);
}

// chat-app/public/client.js

// ... (الكود السابق قبل دالة addChatMessage) ...

function addChatMessage(username, message, timestamp) {
    const item = document.createElement('li');
    // تنسيق الوقت ليكون مقروءًا
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    // تحديد ما إذا كانت الرسالة من المستخدم الحالي لإضافة الفئة الصحيحة
    if (username === loggedInUsername) {
        item.classList.add('my-message');
    } else {
        item.classList.add('other-message');
    }

    // --- هذا هو الجزء المعدل لضمان عرض الاسم والوقت بشكل صحيح ---
    // بناء محتوى الرسالة باستخدام قالب النص (template literal)
    // <bdi> تُستخدم لعزل اتجاه النص لضمان العرض الصحيح للغات المختلطة
    item.innerHTML = `
        <span class="message-meta">
            <strong><bdi>${username}</bdi></strong> <span class="timestamp"><bdi>${time}</bdi></span>
        </span>
        <span class="message-content"><bdi>${message}</bdi></span>
    `;
    // --- نهاية الجزء المعدل ---

    messages.appendChild(item);
    // التمرير إلى الأسفل لعرض أحدث رسالة
    messages.scrollTop = messages.scrollHeight;
}

// ... (بقية الكود بعد دالة addChatMessage) ...


// --- وظائف المحادثات ---

async function getUserConversations() {
    socket.emit('get user conversations');
    socket.emit('request all online statuses'); // نطلب جميع حالات الاتصال عند الدخول لتهيئة القائمة أولاً
}

function loadConversationHistory(convId, convName) {
    messages.innerHTML = ''; // مسح الرسائل القديمة عند التبديل
    currentConversationId = convId; // تحديث معرف المحادثة النشطة
    chatAreaHeader.textContent = convName; // تحديث عنوان منطقة الدردشة
    chatAreaContainer.classList.remove('hidden'); // إظهار منطقة الدردشة

    socket.emit('join conversation', convId); // إعلام الخادم بأن المستخدم انضم لهذه المحادثة
}

// لعرض قائمة المحادثات في الشريط الجانبي مع مؤشر الحالة
function renderConversationsList(conversations) {

    console.log('Rendering conversations list. Current online status map:', usersOnlineStatus);
    conversationsList.innerHTML = ''; // مسح القائمة الحالية قبل إعادة بنائها
    conversations.forEach(conv => {
        const li = document.createElement('li');
        li.classList.add('conversation-item');

        const iconClass = conv.type === 'private' ? 'fas fa-user' : 'fas fa-users';
        const iconElement = document.createElement('i');
        iconElement.classList.add(...iconClass.split(' ')); // إضافة فئات الأيقونة

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('conversation-name');
        nameSpan.textContent = conv.name;

        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('status-indicator');

        // تحديد حالة الاتصال للمحادثات الفردية
        let isOnlineForDisplay = false; // افتراضيًا
        let statusClass = 'offline'; // افتراضيًا
        console.log(`Conv: ${conv.name}, otherUserId: ${conv.otherUserId}, isOnlineForDisplay: ${isOnlineForDisplay}, statusClass: ${statusClass}`);

        if (conv.type === 'private' && conv.otherUserId) { // otherUserId سيأتي من الخادم في كائن المحادثة
            isOnlineForDisplay = usersOnlineStatus.has(conv.otherUserId) ? usersOnlineStatus.get(conv.otherUserId) : false;
            statusClass = isOnlineForDisplay ? 'online' : 'offline';
            li.dataset.otherUserId = conv.otherUserId; // تخزين otherUserId في dataset الـ li
            console.log(`DEBUG: Conversation "${conv.name}" (ID: ${conv.id}) is private? ${conv.type === 'private'}, otherUserId: ${conv.otherUserId}, Is otherUserId in usersOnlineStatus? ${usersOnlineStatus.has(conv.otherUserId)}, Its status: ${usersOnlineStatus.get(conv.otherUserId)}`);
        } else if (conv.type === 'group') {
            statusClass = 'offline'; // افتراضي لمجموعات، يمكن تطويره لاحقاً
        }
        statusIndicator.classList.add(statusClass);

        // إضافة العناصر إلى الـ li بالترتيب الصحيح
        li.appendChild(iconElement);
        li.appendChild(nameSpan);
        li.appendChild(statusIndicator);


        li.dataset.conversationId = conv.id; // تخزين معرف المحادثة

        if (conv.id === currentConversationId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => {
            const activeItem = document.querySelector('.conversation-item.active');
            if (activeItem) {
                activeItem.classList.remove('active');
            }
            li.classList.add('active');
            loadConversationHistory(conv.id, conv.name);
        });
        conversationsList.appendChild(li);

        console.log(`Rendering conversation: ${conv.name}, ID: ${conv.id}, Type: ${conv.type}, Other User ID: ${conv.otherUserId || 'N/A'}, Applied Status Class: ${statusClass}, Is Online: ${isOnlineForDisplay}`);
    });
}


// --- منطق المصادقة ---

async function checkAuthAndRender() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();

        if (data.isAuthenticated) {
            loggedInUsername = data.username;
            currentUsernameSpan.textContent = `مرحباً، ${loggedInUsername}!`;
            authContainer.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            await getUserConversations(); // تجلب المحادثات وحالات الاتصال الأولية
        } else {
            loggedInUsername = '';
            currentConversationId = null;
            authContainer.classList.remove('hidden');
            chatContainer.classList.add('hidden');
            messages.innerHTML = '';
            chatAreaContainer.classList.add('hidden');
            chatAreaHeader.textContent = '';
            usersOnlineStatus.clear(); // مسح حالات الاتصال عند تسجيل الخروج
        }
    } catch (error) {
        console.error('خطأ في التحقق من المصادقة:', error);
        displayMessage(loginMessage, 'حدث خطأ في الشبكة. الرجاء المحاولة لاحقاً.', 'error');
    }
}

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value.trim();

    if (!username || !password) {
        displayMessage(registerMessage, 'الرجاء ملء جميع الحقول.', 'error');
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const text = await response.text();
        if (response.ok) {
            displayMessage(registerMessage, text, 'success');
            registerUsernameInput.value = '';
            registerPasswordInput.value = '';
        } else {
            displayMessage(registerMessage, text, 'error');
        }
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        displayMessage(registerMessage, 'حدث خطأ في الشبكة أثناء التسجيل. الرجاء المحاولة لاحقاً.', 'error');
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!username || !password) {
        displayMessage(loginMessage, 'الرجاء ملء جميع الحقول.', 'error');
        return;
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const text = await response.text();
        if (response.ok) {
            displayMessage(loginMessage, text, 'success');
            loginUsernameInput.value = '';
            loginPasswordInput.value = '';
            await checkAuthAndRender();
            socket.disconnect(); // قطع الاتصال القديم
            socket.connect();   // إعادة الاتصال لتهيئة Socket.IO بشكل صحيح مع الجلسة الجديدة
        } else {
            displayMessage(loginMessage, text, 'error');
        }
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        displayMessage(loginMessage, 'حدث خطأ في الشبكة أثناء تسجيل الدخول. الرجاء المحاولة لاحقاً.', 'error');
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        const response = await fetch('/logout', { method: 'POST' });
        const text = await response.text();
        if (response.ok) {
            alert(text);
            loggedInUsername = '';
            currentConversationId = null;
            authContainer.classList.remove('hidden');
            chatContainer.classList.add('hidden');
            messages.innerHTML = '';
            chatAreaContainer.classList.add('hidden');
            chatAreaHeader.textContent = '';
            usersOnlineStatus.clear(); // مسح حالات الاتصال عند تسجيل الخروج
        } else {
            alert('فشل تسجيل الخروج: ' + text);
        }
    } catch (error) {
        console.error('خطأ في تسجيل الخروج:', error);
        alert('حدث خطأ في الشبكة أثناء تسجيل الخروج.');
    }
});


// --- منطق إنشاء المحادثات الجديدة (من المودال) ---

// معالج حدث لزر فتح المودال العائم (FAB)
newConversationFab.addEventListener('click', () => {
    newConversationModal.classList.remove('hidden');
    // إخفاء جميع النماذج الفرعية عند فتح المودال لأول مرة
    groupFormContainer.classList.add('hidden');
    privateFormContainer.classList.add('hidden');
    modalMessage.textContent = ''; // مسح أي رسائل سابقة
});

// معالج حدث لزر إغلاق المودال
closeModalButton.addEventListener('click', () => {
    newConversationModal.classList.add('hidden');
});

// إغلاق المودال عند النقر خارج المحتوى
window.addEventListener('click', (event) => {
    if (event.target === newConversationModal) {
        newConversationModal.classList.add('hidden');
    }
});

// معالج حدث لزر "إنشاء مجموعة" داخل المودال
showGroupFormButton.addEventListener('click', () => {
    groupFormContainer.classList.remove('hidden');
    privateFormContainer.classList.add('hidden');
    modalMessage.textContent = '';
});

// معالج حدث لزر "محادثة فردية" داخل المودال
showPrivateFormButton.addEventListener('click', () => {
    privateFormContainer.classList.remove('hidden');
    groupFormContainer.classList.add('hidden');
    modalMessage.textContent = '';
});

// معالج حدث لنموذج إنشاء مجموعة داخل المودال
modalCreateGroupChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const groupName = modalGroupChatNameInput.value.trim();
    const participants = modalGroupParticipantsInput.value.trim().split(',').map(name => name.trim()).filter(name => name);

    if (!groupName || participants.length === 0) {
        displayMessage(modalMessage, 'الرجاء إدخال اسم الغرفة والمشاركين.', 'error');
        return;
    }
    socket.emit('create group conversation', { name: groupName, participantUsernames: participants });
    modalGroupChatNameInput.value = '';
    modalGroupParticipantsInput.value = '';
    newConversationModal.classList.add('hidden'); // إغلاق المودال بعد الإرسال
});

// معالج حدث لنموذج بدء محادثة فردية داخل المودال
modalStartPrivateChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const otherUsername = modalPrivateChatUsernameInput.value.trim();
    if (!otherUsername) {
        displayMessage(modalMessage, 'الرجاء إدخال اسم المستخدم.', 'error');
        return;
    }
    if (otherUsername === loggedInUsername) {
        displayMessage(modalMessage, 'لا يمكنك بدء محادثة فردية مع نفسك.', 'error');
        return;
    }
    socket.emit('start private conversation', otherUsername);
    modalPrivateChatUsernameInput.value = '';
    newConversationModal.classList.add('hidden'); // إغلاق المودال بعد الإرسال
});


// --- منطق الدردشة في الوقت الفعلي ---

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && loggedInUsername && currentConversationId) {
        socket.emit('send message', {
            conversationId: currentConversationId,
            messageText: input.value
        });
        input.value = '';
        emojiPicker.classList.add('hidden');
    } else if (!loggedInUsername) {
        alert('الرجاء تسجيل الدخول لإرسال الرسائل.');
    } else if (!currentConversationId) {
        alert('الرجاء اختيار محادثة قبل إرسال الرسائل.');
    }
});

socket.on('receive message', (data) => {
    if (data.conversationId === currentConversationId) {
        addChatMessage(data.username, data.message, data.timestamp);
    }
});

socket.on('conversation history', (data) => {
    if (data.conversationId === currentConversationId) {
        messages.innerHTML = '';
        data.history.forEach(msg => {
            addChatMessage(msg.username, msg.message, msg.timestamp);
        });
    }
});

// تعديل: معالج حدث لاستقبال قائمة المحادثات (لإضافة مؤشر الحالة)
socket.on('user conversations', (conversations) => {
    renderConversationsList(conversations);

    if (conversations.length > 0 && currentConversationId === null) {
        const firstOnlinePrivateConv = conversations.find(conv => conv.type === 'private' && usersOnlineStatus.get(conv.otherUserId));
        if (firstOnlinePrivateConv) {
            loadConversationHistory(firstOnlinePrivateConv.id, firstOnlinePrivateConv.name);
        } else {
            loadConversationHistory(conversations[0].id, conversations[0].name);
        }
    }
});

// إضافة: معالج حدث لتحديثات حالة الاتصال الفردية (متصل/غير متصل)
socket.on('user status update', (data) => {
    usersOnlineStatus.set(data.userId, data.isOnline);
    console.log(`User status update received: ${data.username} (ID: ${data.userId}) is ${data.isOnline ? 'online' : 'offline'}.`);
    updateOnlineStatusIndicator(data.userId, data.isOnline);
});

// إضافة: معالج حدث لاستقبال جميع حالات الاتصال الأولية عند الاتصال
socket.on('all online statuses', (statuses) => {
    usersOnlineStatus.clear();
    for (const userId in statuses) {
        usersOnlineStatus.set(parseInt(userId), statuses[userId].isOnline);
    }
    console.log('Received all online statuses:', statuses);
    // بعد استلام جميع الحالات، أعد عرض قائمة المحادثات لتحديث المؤشرات الصحيحة
    // (البيانات conv.otherUserId ستكون موجودة بعد 'user conversations')
    socket.emit('get user conversations'); // تطلب قائمة المحادثات مع حالات الاتصال المحدثة
});

// إضافة: دالة جديدة لتحديث المؤشر المرئي لحالة الاتصال مباشرة
function updateOnlineStatusIndicator(userId, isOnline) {
    console.log(`Attempting to update status for userId: ${userId}, to ${isOnline ? 'online' : 'offline'}`);
    // ابحث عن جميع عناصر المحادثة التي تمثل محادثات فردية مع هذا المستخدم
    const conversationItems = conversationsList.querySelectorAll(`.conversation-item[data-other-user-id="${userId}"]`);
    conversationItems.forEach(item => {
        const statusIndicator = item.querySelector('.status-indicator');
        if (statusIndicator) {
            statusIndicator.classList.remove('online', 'offline');
            statusIndicator.classList.add(isOnline ? 'online' : 'offline');
        }
    });
}


socket.on('new conversation available', (newConv) => {
    alert(`لديك محادثة جديدة: ${newConv.type === 'group' ? 'غرفة جماعية' : 'محادثة فردية'} مع ${newConv.name || newConv.id}`);
    getUserConversations();
});

socket.on('conversation created', (conv) => {
    alert(`تم إنشاء المحادثة الجماعية "${conv.name}" بنجاح!`);
    getUserConversations();
});

socket.on('private conversation started', (conv) => {
    alert(`تم بدء محادثة فردية مع "${conv.name}" بنجاح!`);
    getUserConversations();
});

socket.on('error message', (msg) => {
    alert('خطأ من الخادم: ' + msg);
});


// --- منطق لوحة مفاتيح الرموز التعبيرية (نفس السابق) ---

const emojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
    '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
    '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳',
    '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖',
    '😫', '😩', '🥺', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵',
    '🥶', '😱', '😨', '🤫', '🤭', '🤥', '😶', '😐', '😑', '🫨',
    '😮', '😦', '😧', '😮‍💨', '😲', '🥱', '😴', '🤤', '😪', '😵',
    '💫', '🤧', '🤒', '🤕', '🤢', '🤮', '🤠', '🥳', '😎', '🤓',
    '❤️', '👍', '🙏', '💯', '😂', '😍', '😊', '🎉', '🔥', '🚀'
];

// دالة لإنشاء لوحة الرموز التعبيرية وعرضها
function renderEmojiPicker() {
    emojiPicker.innerHTML = '';
    emojis.forEach(emoji => {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.addEventListener('click', (event) => {
            event.stopPropagation();
            const cursorPosition = input.selectionStart;
            input.value = input.value.substring(0, cursorPosition) + emoji + input.value.substring(input.selectionEnd);
            input.focus();
            input.selectionEnd = cursorPosition + emoji.length;
        });
        emojiPicker.appendChild(span);
    });
}

// معالج حدث لزر الرموز التعبيرية لتبديل رؤية اللوحة
emojiButton.addEventListener('click', (event) => {
    event.stopPropagation();
    emojiPicker.classList.toggle('hidden');
    if (!emojiPicker.classList.contains('hidden')) {
        renderEmojiPicker();
    }
});

// إخفاء لوحة الرموز التعبيرية عند النقر خارجها أو عند إرسال رسالة
document.addEventListener('click', (event) => {
    if (!emojiButton.contains(event.target) && !emojiPicker.contains(event.target)) {
        emojiPicker.classList.add('hidden');
    }
});


document.addEventListener('DOMContentLoaded', checkAuthAndRender); 