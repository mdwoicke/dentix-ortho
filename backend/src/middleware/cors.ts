import cors from 'cors';

/**
 * CORS Configuration
 * Allows frontend to communicate with backend API
 */

const allowedOrigins = [
  'http://localhost:5173', // Vite dev server default
  'http://localhost:5174', // Alternate Vite port
  'http://localhost:5175', // Alternate Vite port
  'http://localhost:5176', // Alternate Vite port
  'https://localhost:5173', // Vite dev server default (HTTPS/basicSsl)
  'https://localhost:5174', // Alternate Vite port (HTTPS/basicSsl)
  'https://localhost:5175', // Alternate Vite port (HTTPS/basicSsl)
  'https://localhost:5176', // Alternate Vite port (HTTPS/basicSsl)
  'http://localhost:3000', // Alternate frontend port
  'https://crm.digitalresponsetech.com', // Cloudflare Tunnel external access
  process.env.FRONTEND_URL || '', // Production frontend URL
].filter(Boolean);

// Pattern for local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
const isLocalNetworkOrigin = (origin: string): boolean => {
  const localPatterns = [
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
    /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  ];
  return localPatterns.some(pattern => pattern.test(origin));
};

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // Allow explicitly listed origins or any local network IP
    if (allowedOrigins.includes(origin) || isLocalNetworkOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Environment', 'X-Tenant-Id'],
};

export default cors(corsOptions);
