const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
const connectDB  = require('./config/db');

dotenv.config();

const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:3000';

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: FRONTEND_ORIGIN, methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
});

app.set('io', io);

connectDB();

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'https://dass-ruddy.vercel.app',
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Serve uploaded payment proof images as static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth',          require('./routes/authRoutes'));
app.use('/api/events',        require('./routes/eventRoutes'));
app.use('/api/registrations', require('./routes/registrationRoutes'));
app.use('/api/admin',         require('./routes/adminRoutes'));
app.use('/api/participants',  require('./routes/participantRoutes'));
app.use('/api/organizer',     require('./routes/organizerRoutes'));
app.use('/api/teams',         require('./routes/teamRoutes'));
app.use('/api/forum',         require('./routes/forumRoutes'));
app.use('/api/feedback',      require('./routes/feedbackRoutes'));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Felicity API is running' });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Client sends { eventId } to subscribe to a forum room
  socket.on('forum:join', ({ eventId }) => {
    if (eventId) socket.join(`forum:${eventId}`);
  });
  socket.on('forum:leave', ({ eventId }) => {
    if (eventId) socket.leave(`forum:${eventId}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
