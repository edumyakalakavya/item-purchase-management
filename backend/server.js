const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();


const itemTypeRoutes = require('./routes/itemTypeRoutes');
const itemRoutes = require('./routes/itemRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Item & Purchase Management API is running',
    timestamp: new Date().toISOString()
  });
});

// Mount API routes
app.use('/api/item-types', itemTypeRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/purchases', purchaseRoutes);

// 404 Not Found handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
});

// Safe centralized error-handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err.message);

  // Return safe response without leaking sensitive database internal details
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'An unexpected server error occurred.' : err.message
  });
});

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use; attaching to existing instance.`);
  } else {
    throw err;
  }
});

module.exports = app;
