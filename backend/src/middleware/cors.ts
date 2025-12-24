import cors from 'cors';

/**
 * CORS Configuration
 * Allows frontend to communicate with backend API
 */

const allowedOrigins = [
  'http://localhost:5173', // Vite dev server default
  'http://localhost:5174', // Alternate Vite port
  'http://localhost:3000', // Alternate frontend port
  'http://192.168.1.247:5174', // Local network access
  process.env.FRONTEND_URL || '', // Production frontend URL
].filter(Boolean);

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Environment'],
};

export default cors(corsOptions);
