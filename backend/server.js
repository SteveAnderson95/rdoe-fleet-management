const app = require('./src/app');
const pool = require('./src/config/db');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Test de la connexion DB avant demarrage du serveur
    await pool.query('SELECT 1');
    console.log('Connexion DB vérifiée');

    app.listen(PORT, () => {
      console.log(`Serveur démarré sur http://localhost:${PORT}`);
      console.log(`Environnement : ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    console.error('Impossible de démarrer - erreur DB :', err.message);
    process.exit(1);
  }
};

startServer();
