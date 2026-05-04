const pool = require('../config/db');

// GET /api/pieces  — avec filtre optionnel par modele_vehicule
const getAllPieces = async (req, res) => {
  const { modele, search, actif } = req.query;

  let query = `SELECT * FROM pieces_catalogue WHERE 1=1`;
  const params = [];
  let i = 1;

  // Par défaut on retourne seulement les pièces actives
  if (actif !== 'false') { query += ` AND actif = true`; }
  if (modele) {
    query += ` AND (LOWER(modele_vehicule) = LOWER($${i++}) OR modele_vehicule IS NULL)`;
    params.push(modele);
  }
  if (search) {
    query += ` AND LOWER(designation) LIKE LOWER($${i++})`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY modele_vehicule NULLS LAST, designation ASC`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/pieces/:id
const getPieceById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pieces_catalogue WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Pièce introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/pieces
const createPiece = async (req, res) => {
  const { designation, unite, modele_vehicule, prix_contrat, marche_ref } = req.body;

  if (!designation || !prix_contrat)
    return res.status(400).json({ message: 'designation et prix_contrat requis' });

  try {
    const result = await pool.query(`
      INSERT INTO pieces_catalogue (designation, unite, modele_vehicule, prix_contrat, marche_ref)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [designation, unite || 'Pièce', modele_vehicule || null, prix_contrat, marche_ref || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/pieces/:id
const updatePiece = async (req, res) => {
  const { designation, unite, modele_vehicule, prix_contrat, marche_ref, actif } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM pieces_catalogue WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: 'Pièce introuvable' });

    const p = existing.rows[0];
    const result = await pool.query(`
      UPDATE pieces_catalogue SET
        designation = $1, unite = $2, modele_vehicule = $3,
        prix_contrat = $4, marche_ref = $5, actif = $6
      WHERE id = $7 RETURNING *
    `, [
      designation || p.designation,
      unite || p.unite,
      modele_vehicule !== undefined ? modele_vehicule : p.modele_vehicule,
      prix_contrat || p.prix_contrat,
      marche_ref !== undefined ? marche_ref : p.marche_ref,
      actif !== undefined ? actif : p.actif,
      req.params.id
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/pieces/modeles  — liste des modèles distincts dans le catalogue
const getModeles = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT modele_vehicule
      FROM pieces_catalogue
      WHERE modele_vehicule IS NOT NULL AND actif = true
      ORDER BY modele_vehicule ASC
    `);
    res.json(result.rows.map(r => r.modele_vehicule));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getAllPieces, getPieceById, createPiece, updatePiece, getModeles };
