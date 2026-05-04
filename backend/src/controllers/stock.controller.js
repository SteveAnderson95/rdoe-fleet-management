const pool = require('../config/db');

// GET /api/stock  — stock du fournisseur connecté
const getMyStock = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, pc.prix_contrat, pc.marche_ref
      FROM stock_pieces s
      LEFT JOIN pieces_catalogue pc ON s.piece_id = pc.id
      WHERE s.fournisseur_id = $1
      ORDER BY s.designation ASC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/stock  — ajouter une pièce au stock
const addStockItem = async (req, res) => {
  const { piece_id, designation, quantite_stock, seuil_alerte, unite } = req.body;

  if (!designation)
    return res.status(400).json({ message: 'designation est requis' });

  try {
    const result = await pool.query(`
      INSERT INTO stock_pieces (fournisseur_id, piece_id, designation, quantite_stock, seuil_alerte, unite)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.user.id, piece_id || null, designation, quantite_stock || 0, seuil_alerte || 5, unite || 'Pièce']);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/stock/:id  — mettre à jour la quantité
const updateStockItem = async (req, res) => {
  const { quantite_stock, seuil_alerte, designation, unite } = req.body;

  try {
    const existing = await pool.query(
      'SELECT * FROM stock_pieces WHERE id = $1 AND fournisseur_id = $2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0)
      return res.status(404).json({ message: 'Article introuvable dans votre stock' });

    const s = existing.rows[0];
    const result = await pool.query(`
      UPDATE stock_pieces SET
        quantite_stock = $1, seuil_alerte = $2,
        designation = $3, unite = $4, updated_at = NOW()
      WHERE id = $5 RETURNING *
    `, [
      quantite_stock !== undefined ? quantite_stock : s.quantite_stock,
      seuil_alerte !== undefined ? seuil_alerte : s.seuil_alerte,
      designation || s.designation,
      unite || s.unite,
      req.params.id
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/stock/:id
const deleteStockItem = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM stock_pieces WHERE id = $1 AND fournisseur_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Article introuvable' });

    res.json({ message: 'Article supprimé du stock' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/stock/alerts  — pièces sous le seuil d'alerte
const getStockAlerts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM stock_pieces
      WHERE fournisseur_id = $1 AND quantite_stock <= seuil_alerte
      ORDER BY quantite_stock ASC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getMyStock, addStockItem, updateStockItem, deleteStockItem, getStockAlerts };
