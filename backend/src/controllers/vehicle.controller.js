const pool = require('../config/db');

// GET /api/vehicles
const getAllVehicles = async (req, res) => {
  const { etat, type_affectation, marque, search } = req.query;

  let query = `SELECT * FROM vehicles WHERE 1=1`;
  const params = [];
  let i = 1;

  if (etat) {
    query += ` AND etat = $${i++}`;
    params.push(etat);
  }
  if (type_affectation) {
    query += ` AND type_affectation = $${i++}`;
    params.push(type_affectation);
  }
  if (marque) {
    query += ` AND LOWER(marque) = LOWER($${i++})`;
    params.push(marque);
  }
  if (search) {
    query += ` AND (LOWER(immatriculation) LIKE LOWER($${i}) OR LOWER(marque) LIKE LOWER($${i}))`;
    params.push(`%${search}%`);
    i++;
  }

  query += ` ORDER BY marque ASC, immatriculation ASC`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/vehicles/:id
const getVehicleById = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Véhicule introuvable' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/vehicles
const createVehicle = async (req, res) => {
  const {
    marque, type_vehicule, immatriculation,
    date_acquisition, etat, affectation, type_affectation
  } = req.body;

  if (!marque || !immatriculation) {
    return res.status(400).json({ message: 'Marque et immatriculation requis' });
  }

  const etatsValides = ['bon_etat', 'en_panne', 'a_reformer', 'en_maintenance'];
  if (etat && !etatsValides.includes(etat)) {
    return res.status(400).json({ message: 'État invalide' });
  }

  try {
    const exists = await pool.query(
      'SELECT id FROM vehicles WHERE immatriculation = $1',
      [immatriculation]
    );

    if (exists.rows.length > 0) {
      return res.status(409).json({ message: 'Immatriculation déjà existante' });
    }

    const result = await pool.query(
      `INSERT INTO vehicles
         (marque, type_vehicule, immatriculation, date_acquisition, etat, affectation, type_affectation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [marque, type_vehicule, immatriculation, date_acquisition,
       etat || 'bon_etat', affectation, type_affectation]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/vehicles/:id
const updateVehicle = async (req, res) => {
  const {
    marque, type_vehicule, immatriculation,
    date_acquisition, etat, affectation, type_affectation
  } = req.body;

  try {
    const existing = await pool.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Véhicule introuvable' });
    }

    const v = existing.rows[0];

    const result = await pool.query(
      `UPDATE vehicles SET
         marque = $1, type_vehicule = $2, immatriculation = $3,
         date_acquisition = $4, etat = $5, affectation = $6,
         type_affectation = $7, updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        marque || v.marque,
        type_vehicule || v.type_vehicule,
        immatriculation || v.immatriculation,
        date_acquisition || v.date_acquisition,
        etat || v.etat,
        affectation || v.affectation,
        type_affectation || v.type_affectation,
        req.params.id
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/vehicles/:id
const deleteVehicle = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM vehicles WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Véhicule introuvable' });
    }

    res.json({ message: 'Véhicule supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/vehicles/stats - pour le dashboard
const getVehicleStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE etat = 'bon_etat')       AS bon_etat,
        COUNT(*) FILTER (WHERE etat = 'en_panne')        AS en_panne,
        COUNT(*) FILTER (WHERE etat = 'en_maintenance')  AS en_maintenance,
        COUNT(*) FILTER (WHERE etat = 'a_reformer')      AS a_reformer,
        COUNT(*)                                         AS total
      FROM vehicles
    `);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleStats
};
