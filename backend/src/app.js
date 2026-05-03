const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Middlewares globaux
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/vehicles', require('./routes/vehicle.routes'));

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'RDOE Fleet API opérationnelle' });
});

// Gestion des routes inconnues
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} introuvable` });
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Erreur serveur interne' });
});

module.exports = app;
