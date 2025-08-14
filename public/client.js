// chat-app/public/client.js
// هذا الكود يمنع ظهور أي شيء في الـ Console
// ضعه في بداية ملف client.js أو في وسم <script> في index.html
// قبل أي سكريبت آخر يقوم بالطباعة.

// يمكنك حفظ الدالة الأصلية إذا احتجت إليها لاحقاً
// const originalConsoleLog = console.log;

// This code prevents users from opening the developer tools
document.addEventListener('contextmenu', event => event.preventDefault()); // Disables right-click
document.addEventListener('keydown', function (event) {
    // Disable F12
    if (event.keyCode === 123) {
        event.preventDefault();
    }
    // Disable Ctrl+Shift+I
    if (event.ctrlKey && event.shiftKey && event.keyCode === 73) {
        event.preventDefault();
    }
    // Disable Ctrl+Shift+C
    if (event.ctrlKey && event.shiftKey && event.keyCode === 67) {
        event.preventDefault();
    }
    // Disable Ctrl+U (view page source)
    if (event.ctrlKey && event.keyCode === 85) {
        event.preventDefault();
    }
});


console.log = function () { };
console.warn = function () { };
console.error = function () { };
console.info = function () { };
console.debug = function () { };
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

// نماذج الإنشاء الفعلية داخل المودال
const modalCreateGroupChatForm = document.getElementById('modal-create-group-chat-form');
const modalGroupChatNameInput = document.getElementById('modal-group-chat-name');
const modalGroupParticipantsInput = document.getElementById('modal-group-participants');

const modalStartPrivateChatForm = document.getElementById('modal-start-private-chat-form');
const modalPrivateChatUsernameInput = document.getElementById('modal-private-chat-username');


const chatAreaHeader = document.getElementById('chat-area-header');
const chatAreaContainer = document.getElementById('chat-area-container');


const backButton = document.getElementById('back-to-conversations');
let loggedInUsername = '';
let currentConversationId = null;

backButton.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
        chatContainer.classList.remove('show-chat');
        chatAreaContainer.classList.add('hidden');
    }
});

// منطق إرسال إشعار "يكتب..."
input.addEventListener('input', () => {
    if (!isTyping && currentConversationId) {
        isTyping = true;
        socket.emit('typing', { conversationId: currentConversationId, username: loggedInUsername });
    }
    // مسح المؤقت الحالي وإعادة ضبطه
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    // إرسال إشعار "توقف عن الكتابة" بعد 1.5 ثانية من التوقف
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('stopped typing', { conversationId: currentConversationId, username: loggedInUsername });
    }, 1500);
});

// معالج حدث لإظهار مؤشر الكتابة من المستخدمين الآخرين
socket.on('user typing', (data) => {
    // تأكد أن الإشعار خاص بالمحادثة الحالية وليس من المستخدم الحالي
    if (data.conversationId === currentConversationId && data.username !== loggedInUsername) {
        chatAreaHeader.textContent = `${data.username} يكتب...`;
    }
});

// معالج حدث لإخفاء مؤشر الكتابة
socket.on('user stopped typing', (data) => {
    if (data.conversationId === currentConversationId) {
        // إعادة عنوان المحادثة إلى الاسم الأصلي
        const activeConvItem = document.querySelector(`.conversation-item[data-conversation-id="${currentConversationId}"]`);
        if (activeConvItem) {
            const convName = activeConvItem.querySelector('.conversation-name').textContent;
            chatAreaHeader.textContent = convName;
        }
    }
});

// لتتبع حالة الاتصال للمستخدمين في الواجهة الأمامية
const usersOnlineStatus = new Map(); // Stores userId -> isOnline (true/false)

// لتتبع حالة الكتابة
let isTyping = false;
let typingTimeout = null;
// --- دوال مساعدة ---

function displayMessage(element, text, type) {
    element.textContent = text;
    element.className = 'message ' + type;
    setTimeout(() => {
        element.textContent = '';
        element.className = 'message';
    }, 5000);
}

function addChatMessage(username, message, timestamp, messageId) {
    const item = document.createElement('li');
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    if (username === loggedInUsername) {
        item.classList.add('my-message');

        // Logic to determine which icon to display based on deliveredAt and readAt

        // This is a crucial addition to identify the message for updates
        item.dataset.messageId = messageId;

        item.innerHTML = `
            <span class="message-meta">
                <span class="timestamp"><bdi>${time}</bdi></span>
                
            </span>
            <span class="message-content"><bdi>${message}</bdi></span>
        `;
    } else {
        item.classList.add('other-message');
        item.innerHTML = `
            <span class="message-meta">
                <strong><bdi>${username}</bdi></strong>
                <span class="timestamp"><bdi>${time}</bdi></span>
            </span>
            <span class="message-content"><bdi>${message}</bdi></span>
        `;
    }

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}


// --- وظائف المحادثات ---

async function getUserConversations() {
    socket.emit('get user conversations');
    socket.emit('request all online statuses'); // نطلب جميع حالات الاتصال عند الدخول لتهيئة القائمة أولاً
}

function loadConversationHistory(convId, convName) {

    if (window.innerWidth <= 768) {
        chatContainer.classList.add('show-chat');
        chatAreaContainer.classList.remove('hidden');
    }
    messages.innerHTML = '';
    currentConversationId = convId;
    chatAreaHeader.textContent = convName;
    chatAreaContainer.classList.remove('hidden');



    socket.emit('join conversation', convId);
    socket.emit('mark as read', convId);
}

// لعرض قائمة المحادثات في الشريط الجانبي مع مؤشر الحالة
function renderConversationsList(conversations) {
    console.log('Rendering conversations list. Current online status map:', usersOnlineStatus); // DEBUG
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

        // الكود المصحح في renderConversationsList
        if (conv.type === 'private' && conv.otherUserId) {
            // الآن، usersOnlineStatus.get(conv.otherUserId) سيعيد true أو false مباشرة
            isOnlineForDisplay = usersOnlineStatus.get(conv.otherUserId) || false;
            statusClass = isOnlineForDisplay ? 'online' : 'offline';
            li.dataset.otherUserId = conv.otherUserId;
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

            // هذا هو التعديل الأساسي
            // يتم إرسال الإشعار عندما يتم فتح المحادثة
            socket.emit('mark as read', conv.id);
        });
        conversationsList.appendChild(li);

        console.log(`Rendering conversation: ${conv.name}, ID: ${conv.id}, Type: ${conv.type}, Other User ID: ${conv.otherUserId || 'N/A'}, Applied Status Class: ${statusClass}, Is Online: ${isOnlineForDisplay}`); // DEBUG
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

            console.log("checkAuthAndRender: User is authenticated. Hiding auth, showing chat."); // DEBUG
            authContainer.classList.add('hidden'); // إخفاء حاوية المصادقة
            chatContainer.classList.remove('hidden'); // إظهار حاوية التطبيق الرئيسي للدردشة

            await getUserConversations(); // تجلب المحادثات وحالات الاتصال الأولية
            console.log("checkAuthAndRender: getUserConversations completed."); // DEBUG

        } else {
            console.log("checkAuthAndRender: User is NOT authenticated. Showing auth, hiding chat."); // DEBUG
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
        console.error('Error in checkAuthAndRender:', error); // DEBUG
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

            console.log("Login successful. Calling checkAuthAndRender..."); // DEBUG
            // **هنا نقوم بتغيير التنفيذ:**
            // نستخدم setTimeout لضمان أن Socket.IO يعيد الاتصال بعد فترة قصيرة
            // للسماح للجلسة بالاستقرار.
            setTimeout(async () => {
                await checkAuthAndRender(); // هذه هي الدالة التي يجب أن تحول الواجهة
                console.log("After checkAuthAndRender. Disconnecting/connecting socket..."); // DEBUG
                socket.disconnect(); // قطع الاتصال القديم
                socket.connect();   // إعادة الاتصال لتهيئة Socket.IO بشكل صحيح مع الجلسة الجديدة
                console.log("Socket reconnected. Login process finished."); // DEBUG
            }, 100); // تأخير 100 مللي ثانية (يمكن زيادتها إذا لزم الأمر)

        } else {
            displayMessage(loginMessage, text, 'error');
            console.error("Login failed:", text); // DEBUG
        }
    } catch (error) {
        console.error('Error during login fetch:', error); // DEBUG
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
modalCreateGroupChatForm.addEventListener('submit', async (e) => { // إضافة async
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
modalStartPrivateChatForm.addEventListener('submit', async (e) => { // إضافة async
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
    // Check if the message is from a conversation you're currently in.
    const isCurrentConversation = (data.conversationId === currentConversationId);

    // Add the message to the chat display
    if (isCurrentConversation) {
        // إضافة الرسالة إلى الشاشة
        addChatMessage(data.username, data.message, data.timestamp, data.messageId, data.deliveredAt, data.readAt);

        // عند استلام الرسالة، يتم إرسال إشعار "تم التسليم" إلى الخادم


        // إذا كان المستخدم في نفس المحادثة، يتم إرسال إشعار "تمت القراءة" أيضًا
        socket.emit('mark as read', data.conversationId);
    }

    // This block handles desktop notifications if the conversation isn't open or the tab isn't focused.
    if (!isCurrentConversation || !document.hasFocus()) {
        if (Notification.permission === "granted") {
            const notification = new Notification(`رسالة جديدة من ${data.username}`, {
                body: data.message,
                icon: 'https://cdn-icons-png.flaticon.com/512/134/134914.png' // Using a generic icon
            });
            notification.onclick = function () {
                window.focus();
            };
        }
    }
});






// في ملف client.js


socket.on('conversation history', (data) => {
    if (data.conversationId === currentConversationId) {
        messages.innerHTML = '';
        data.history.forEach(msg => {
            // يجب أن يتم تمرير جميع المعلمات، بما في ذلك messageId و deliveredAt
            addChatMessage(msg.username, msg.message, msg.timestamp, msg.messageId, msg.deliveredAt, msg.readAt);
        });
    }
});

// معالج حدث لاستقبال قائمة المحادثات
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

// معالج حدث لتحديثات حالة الاتصال الفردية (متصل/غير متصل)
socket.on('user status update', (data) => {
    usersOnlineStatus.set(data.userId, data.isOnline);
    console.log(`User status update received: ${data.username} (ID: ${data.userId}) is ${data.isOnline ? 'online' : 'offline'}.`);
    updateOnlineStatusIndicator(data.userId, data.isOnline);
});

// معالج حدث لاستقبال جميع حالات الاتصال الأولية عند الاتصال
// الكود المصحح في client.js
socket.on('all online statuses', (statuses) => {
    usersOnlineStatus.clear();
    for (const userId in statuses) {
        // نأخذ قيمة isOnline فقط
        usersOnlineStatus.set(parseInt(userId), statuses[userId].isOnline);
    }
    console.log('Received all online statuses:', usersOnlineStatus);
    socket.emit('get user conversations'); // تطلب قائمة المحادثات مع حالات الاتصال المحدثة
});

// دالة لتحديث المؤشر المرئي لحالة الاتصال مباشرة
function updateOnlineStatusIndicator(userId, isOnline) {
    console.log(`Attempting to update status for userId: ${userId}, to ${isOnline ? 'online' : 'offline'}`);
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


// --- منطق لوحة مفاتيح الرموز التعبيرية ---

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

emojiButton.addEventListener('click', (event) => {
    event.stopPropagation();
    emojiPicker.classList.toggle('hidden');
    if (!emojiPicker.classList.contains('hidden')) {
        renderEmojiPicker();
    }
});

document.addEventListener('click', (event) => {
    if (!emojiButton.contains(event.target) && !emojiPicker.contains(event.target)) {
        emojiPicker.classList.add('hidden');
    }
});


document.addEventListener('DOMContentLoaded', checkAuthAndRender);

// طلب إذن الإشعارات من المستخدم
document.addEventListener('DOMContentLoaded', () => {
    if (!("Notification" in window)) {
        console.warn("هذا المتصفح لا يدعم إشعارات سطح المكتب.");
    } else if (Notification.permission !== "denied" || Notification.permission === "default") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                console.log("تم منح إذن الإشعارات.");
            }
        });
    }
});


