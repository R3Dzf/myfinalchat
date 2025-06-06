// chat-app/server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io'); // استيراد Socket.IO بشكل صحيح
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const app = express();
const server = http.createServer(app);

// تهيئة Socket.IO: io هو الكائن الذي يمثل Socket.IO على الخادم
const io = new socketIo.Server(server, {
    cookie: true // Enable Socket.IO to read cookies (for session)
});

// To track active sockets for each user
// This will ensure notifications are sent only to authenticated and active users.
const activeUserSockets = new Map(); // Map<userId, Set<socket.id>>

// Added: To store online status of users
const userOnlineStatus = new Map(); // Map<userId, { username: string, isOnline: boolean }>

const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- PostgreSQL Database Connection Setup ---
const pool = new Pool({
    user: 'postgres', // Make sure to update this
    host: 'localhost',
    database: 'chat_app_db', // Make sure to update this
    password: '1234', // Make sure to update this
    port: 5432,
});

pool.connect()
    .then(client => {
        console.log('✅ Connected to PostgreSQL database successfully!');
        client.release();
    })
    .catch(err => console.error('❌ Failed to connect to PostgreSQL database:', err.stack));

// --- Session Setup ---
const sessionMiddleware = session({
    store: new pgSession({
        pool: pool,
        tableName: 'session'
    }),
    secret: 'your_super_secret_key_for_session_!!!_change_this_long_and_random', // Must be a long and random string
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        secure: process.env.NODE_ENV === 'production', // Use 'true' in production for HTTPS
        httpOnly: true // Prevents cookie access from client-side JavaScript
    }
});
app.use(sessionMiddleware);

// --- Socket.IO Session Integration ---
io.engine.use(sessionMiddleware);

// Serve static files from the 'public' directory
app.use(express.static('public'));

// --- Authentication API Routes ---

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('Please enter username and password.');
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
            [username, hashedPassword]
        );
        res.status(201).send('User registered successfully! You can now log in.');
    } catch (error) {
        if (error.code === '23505') {
            console.error(`Attempt to register existing username: ${username}`);
            res.status(400).send('Username already exists. Please choose another.');
        } else {
            console.error('❌ Error during registration process:', error);
            res.status(500).send('An internal error occurred during registration. Please try again.');
        }
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('Please enter username and password.');
    }
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            return res.status(400).send('Incorrect username or password.');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).send('Incorrect username or password.');
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.save();

        res.status(200).send('Logged in successfully!');

    } catch (error) {
        console.error('❌ Error during login process:', error);
        res.status(500).send('An internal error occurred during login. Please try again.');
    }
});

app.get('/check-auth', (req, res) => {
    if (req.session.userId && req.session.username) {
        res.json({ isAuthenticated: true, username: req.session.username });
    } else {
        res.json({ isAuthenticated: false });
    }
});

app.post('/logout', (req, res) => {
    console.log('[/logout] route accessed.');
    req.session.destroy(err => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).send('Failed to log out.');
        }
        res.clearCookie('connect.sid');
        console.log('Session destroyed and cookie cleared.');
        res.status(200).send('Logged out successfully!');
    });
});

app.get('/chat-history', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).send('Unauthorized to access chat history.');
    }
    try {
        const result = await pool.query('SELECT username, message_text, timestamp FROM messages ORDER BY timestamp ASC');
        const messagesHistory = result.rows.map(row => ({
            username: row.username,
            message: row.message_text,
            timestamp: row.timestamp.toISOString()
        }));
        console.log(`[HTTP] Chat history sent for user: ${req.session.username}`);
        res.json(messagesHistory);
    } catch (error) {
        console.error('❌ Error fetching chat history (HTTP route):', error);
        res.status(500).send('Failed to fetch chat history.');
    }
});


// --- Socket.IO Logic for Real-time Chat & Conversations ---

io.on('connection', async (socket) => {
    const userId = socket.request.session.userId;
    const username = socket.request.session.username;

    if (!userId || !username) {
        console.log(`🚫 Unauthenticated Socket.IO connection attempt: ${socket.id}`);
        socket.disconnect(true); // Disconnect if user is not authenticated
        return;
    }

    console.log(`Authenticated user connected via Socket.IO: ${username} (ID: ${userId}, SocketID: ${socket.id})`);

    // Add socket to activeUserSockets map
    if (!activeUserSockets.has(userId)) {
        activeUserSockets.set(userId, new Set());
    }
    activeUserSockets.get(userId).add(socket.id);

    // Update user's online status
    userOnlineStatus.set(userId, { username, isOnline: true });
    // Notify all connected clients about this user's online status
    io.emit('user status update', { userId, username, isOnline: true });
    console.log(`User ${username} is now online. Total active sockets for user: ${activeUserSockets.get(userId).size}`);


    socket.join(userId.toString()); // Each user joins a room named after their ID

    socket.on('send message', async (data) => {
        const { conversationId, messageText } = data;

        if (!conversationId || !messageText || !username || !userId) {
            console.warn(`Incomplete or unauthorized message from ${username}:`, data);
            socket.emit('error message', 'Failed to send message: Incomplete data.');
            return;
        }

        try {
            const participantCheck = await pool.query(
                'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
                [conversationId, userId]
            );

            if (participantCheck.rows.length === 0) {
                console.warn(`🚫 User ${username} (ID: ${userId}) tried to send message to unauthorized conversation: ${conversationId}`);
                socket.emit('error message', 'You are not authorized to send messages in this conversation.');
                return;
            }

            await pool.query(
                'INSERT INTO messages (conversation_id, user_id, username, message_text) VALUES ($1, $2, $3, $4)',
                [conversationId, userId, username, messageText]
            );
            console.log(`New message in conversation ${conversationId} from ${username}: "${messageText}"`);

            io.to(conversationId.toString()).emit('receive message', {
                conversationId: conversationId,
                username: username,
                message: messageText,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Error saving or sending message:', error);
            socket.emit('error message', 'An error occurred while sending the message.');
        }
    });


    socket.on('join conversation', async (conversationId) => {
        try {
            const participantCheck = await pool.query(
                'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
                [conversationId, userId]
            );

            if (participantCheck.rows.length === 0) {
                console.warn(`🚫 User ${username} (ID: ${userId}) tried to join unauthorized conversation: ${conversationId}`);
                socket.emit('error message', 'You are not authorized to join this conversation.');
                return;
            }

            // Leave any previously joined conversation room (important for switching chats)
            socket.rooms.forEach(room => {
                if (room !== socket.id.toString() && room !== userId.toString()) {
                    socket.leave(room);
                    console.log(`${username} left room: ${room}`);
                }
            });


            socket.join(conversationId.toString());
            console.log(`${username} (ID: ${userId}) joined conversation: ${conversationId}`);

            const result = await pool.query(
                'SELECT username, message_text, timestamp FROM messages WHERE conversation_id = $1 ORDER BY timestamp ASC',
                [conversationId]
            );
            const messagesHistory = result.rows.map(row => ({
                username: row.username,
                message: row.message_text,
                timestamp: row.timestamp.toISOString()
            }));

            socket.emit('conversation history', { conversationId: conversationId, history: messagesHistory });

        } catch (error) {
            console.error(`❌ Error joining conversation ${conversationId} for ${username}:`, error);
            socket.emit('error message', 'Failed to join conversation or fetch history.');
        }
    });


    socket.on('create group conversation', async ({ name, participantUsernames }) => {
        if (!name || !participantUsernames || !Array.isArray(participantUsernames) || participantUsernames.length === 0) {
            socket.emit('error message', 'Invalid data for creating a group conversation.');
            return;
        }

        try {
            const userIdsResult = await pool.query(
                'SELECT id, username FROM users WHERE username = ANY($1::varchar[])',
                [participantUsernames.concat(username)]
            );
            const foundUsers = userIdsResult.rows;

            if (foundUsers.length !== participantUsernames.length + 1) {
                socket.emit('error message', 'Some specified users do not exist.');
                return;
            }

            const newConvResult = await pool.query(
                "INSERT INTO conversations (type, name) VALUES ('group', $1) RETURNING id",
                [name]
            );
            const newConversationId = newConvResult.rows[0].id;

            const participantValues = foundUsers.map(u => `(${newConversationId}, ${u.id})`).join(',');
            await pool.query(
                `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ${participantValues}`
            );

            console.log(`New group conversation created: "${name}" (ID: ${newConversationId}) with participants: ${foundUsers.map(u => u.username).join(', ')}`);

            foundUsers.forEach(user => {
                if (activeUserSockets.has(user.id)) {
                    activeUserSockets.get(user.id).forEach(socketId => {
                        io.to(socketId).emit('new conversation available', {
                            id: newConversationId,
                            type: 'group',
                            name: name
                        });
                    });
                    console.log(`New group conversation notification sent to ${user.username} (ID: ${user.id}).`);
                } else {
                    console.log(`User ${user.username} (ID: ${user.id}) is not currently connected, no immediate notification sent.`);
                }
            });

            socket.emit('conversation created', {
                id: newConversationId,
                type: 'group',
                name: name
            });

        } catch (error) {
            console.error('❌ Error creating group conversation:', error);
            socket.emit('error message', 'Failed to create group conversation.');
        }
    });


    socket.on('start private conversation', async (otherUsername) => {
        if (!otherUsername || otherUsername === username) {
            socket.emit('error message', 'Invalid username for starting private conversation.');
            return;
        }
        try {
            const otherUserResult = await pool.query('SELECT id FROM users WHERE username = $1', [otherUsername]);
            const otherUser = otherUserResult.rows[0];

            if (!otherUser) {
                socket.emit('error message', `User '${otherUsername}' not found.`);
                return;
            }
            const otherUserId = otherUser.id;

            const existingConvResult = await pool.query(
                `SELECT c.id FROM conversations c
                 JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
                 JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
                 WHERE c.type = 'private'
                 AND cp1.user_id = $1 AND cp2.user_id = $2
                 AND cp1.user_id <> cp2.user_id`,
                [userId, otherUserId]
            );

            let conversationId;
            if (existingConvResult.rows.length > 0) {
                conversationId = existingConvResult.rows[0].id;
                console.log(`Private conversation exists between ${username} and ${otherUsername}: ${conversationId}`);
            } else {
                const newConvResult = await pool.query(
                    "INSERT INTO conversations (type) VALUES ('private') RETURNING id",
                    []
                );
                conversationId = newConvResult.rows[0].id;

                await pool.query(
                    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($3, $4)',
                    [conversationId, userId, conversationId, otherUserId]
                );
                console.log(`New private conversation created: ${conversationId} between ${username} and ${otherUsername}`);

                if (activeUserSockets.has(otherUserId)) {
                    activeUserSockets.get(otherUserId).forEach(socketId => {
                        io.to(socketId).emit('new conversation available', {
                            id: conversationId,
                            type: 'private',
                            name: username // Initiating user's username
                        });
                    });
                    console.log(`New private conversation notification sent to ${otherUsername} (ID: ${otherUserId}).`);
                } else {
                    console.log(`User ${otherUsername} (ID: ${otherUserId}) is not currently connected, no immediate notification sent.`);
                }
            }

            socket.emit('private conversation started', {
                id: conversationId,
                type: 'private',
                name: otherUsername
            });

        } catch (error) {
            console.error('❌ Error starting private conversation:', error);
            socket.emit('error message', 'Failed to start private conversation.');
        }
    });

    socket.on('get user conversations', async () => {
        try {
            // Added: Include online status in the list of conversations
            const result = await pool.query(
                `SELECT c.id, c.type, c.name
                 FROM conversations c
                 JOIN conversation_participants cp ON c.id = cp.conversation_id
                 WHERE cp.user_id = $1
                 ORDER BY c.created_at DESC`,
                [userId]
            );

            const conversations = await Promise.all(result.rows.map(async (conv) => {
                if (conv.type === 'private') {
                    const otherParticipantResult = await pool.query(
                        `SELECT u.id, u.username FROM users u
                         JOIN conversation_participants cp ON u.id = cp.user_id
                         WHERE cp.conversation_id = $1 AND cp.user_id != $2`,
                        [conv.id, userId]
                    );
                    const otherUser = otherParticipantResult.rows[0];
                    const otherUsername = otherUser ? otherUser.username : 'Unknown User';
                    const otherUserId = otherUser ? otherUser.id : null;

                    // Determine online status for the other private chat participant
                    const isOtherUserOnline = userOnlineStatus.has(otherUserId) ? userOnlineStatus.get(otherUserId).isOnline : false;

                    return {
                        id: conv.id,
                        type: conv.type,
                        name: otherUsername, // Other user's username is the conversation name
                        isOnline: isOtherUserOnline, // Added online status
                        otherUserId: otherUserId // Added for client-side tracking
                    };
                }
                // For group chats, we might determine group member status later if needed.
                // For now, group chat online status will be false or undefined.
                return {
                    id: conv.id,
                    type: conv.type,
                    name: conv.name || 'Group Conversation',
                    isOnline: false, // Default to false for group chats
                    otherUserId: null // Not applicable for group chats
                };
            }));

            socket.emit('user conversations', conversations);
            console.log(`${username} fetched ${conversations.length} conversation(s).`);

        } catch (error) {
            console.error(`❌ Error fetching conversations for user ${username}:`, error);
            socket.emit('error message', 'Failed to fetch conversations.');
        }
    });

    // Added: Event for clients to request current online status of all users
    socket.on('request all online statuses', () => {
        const statuses = {};
        userOnlineStatus.forEach((status, uid) => {
            statuses[uid] = { username: status.username, isOnline: status.isOnline };
        });
        socket.emit('all online statuses', statuses);
        console.log(`Sent all online statuses to ${username}.`);
    });


    socket.on('disconnect', () => {
        console.log(`User disconnected: ${username} (ID: ${userId}, SocketID: ${socket.id})`);
        // Remove the socket upon disconnect
        if (activeUserSockets.has(userId)) {
            activeUserSockets.get(userId).delete(socket.id);
            if (activeUserSockets.get(userId).size === 0) {
                // If no active sockets left for this user, mark as offline
                userOnlineStatus.set(userId, { username, isOnline: false });
                io.emit('user status update', { userId, username, isOnline: false });
                console.log(`User ${username} is now offline.`);
                activeUserSockets.delete(userId); // Remove user from active sockets map
            }
        }
    });
});

// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`🚀 Server running on port: http://localhost:${PORT}`);
});