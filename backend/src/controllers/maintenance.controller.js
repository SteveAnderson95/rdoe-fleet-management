const pool = require('../config/db');

// GET /api/maintenances
const getAllMaintenances = async (req, res) => {
  const { vehicle_id, type_maintenance, statut, from, to } = req.query;

  let query = `
    SELECT
      m.*,
      v.marque, v.modele, v.immatriculation,
      u.nom AS created_by_nom, u.prenom AS created_by_prenom,
      COALESCE(
        (SELECT SUM(total_ht) FROM maintenance_items WHERE maintenance_id = m.id), 0
      ) AS cout_total_ht
    FROM maintenances m
    LEFT JOIN vehicles v ON m.vehicle_id = v.id
    LEFT JOIN users u ON m.created_by = u.id
    WHERE 1=1
  `;
  const params = [];
  let i = 1;

  if (vehicle_id) { query += ` AND m.vehicle_id = $${i++}`; params.push(vehicle_id); }
  if (type_maintenance) { query += ` AND m.type_maintenance = $${i++}`; params.push(type_maintenance); }
  if (statut) { query += ` AND m.statut = $${i++}`; params.push(statut); }
  if (from) { query += ` AND m.date_intervention >= $${i++}`; params.push(from); }
  if (to) { query += ` AND m.date_intervention <= $${i++}`; params.push(to); }

  query += ` ORDER BY m.date_intervention DESC`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/maintenances/:id  — avec ses items
const getMaintenanceById = async (req, res) => {
  try {
    const maintenance = await pool.query(`
      SELECT
        m.*,
        v.marque, v.modele, v.immatriculation,
        u.nom AS created_by_nom, u.prenom AS created_by_prenom
      FROM maintenances m
      LEFT JOIN vehicles v ON m.vehicle_id = v.id
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.id = $1
    `, [req.params.id]);

    if (maintenance.rows.length === 0)
      return res.status(404).json({ message: 'Maintenance introuvable' });

    const items = await pool.query(`
      SELECT mi.*, pc.designation AS piece_designation_catalogue
      FROM maintenance_items mi
      LEFT JOIN pieces_catalogue pc ON mi.piece_id = pc.id
      WHERE mi.maintenance_id = $1
      ORDER BY mi.created_at ASC
    `, [req.params.id]);

    res.json({ ...maintenance.rows[0], items: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/maintenances  — crée maintenance + ses items en une transaction
const createMaintenance = async (req, res) => {
  const {
    vehicle_id, date_intervention, type_maintenance,
    description, kilometrage, fournisseur_nom, statut, notes,
    items = []   // [{ piece_id?, designation, quantite, prix_unitaire }]
  } = req.body;

  if (!vehicle_id || !type_maintenance)
    return res.status(400).json({ message: 'vehicle_id et type_maintenance sont requis' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const mResult = await client.query(`
      INSERT INTO maintenances
        (vehicle_id, created_by, date_intervention, type_maintenance,
         description, kilometrage, fournisseur_nom, statut, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      vehicle_id, req.user.id,
      date_intervention || new Date().toISOString().split('T')[0],
      type_maintenance, description, kilometrage,
      fournisseur_nom, statut || 'en_cours', notes
    ]);

    const maintenance = mResult.rows[0];

    // Insérer les items
    for (const item of items) {
      if (!item.designation || !item.quantite || !item.prix_unitaire)
        throw new Error('Chaque item doit avoir designation, quantite et prix_unitaire');

      await client.query(`
        INSERT INTO maintenance_items
          (maintenance_id, piece_id, designation, quantite, prix_unitaire)
        VALUES ($1,$2,$3,$4,$5)
      `, [maintenance.id, item.piece_id || null, item.designation, item.quantite, item.prix_unitaire]);
    }

    // Mettre à jour le kilométrage du véhicule si fourni
    if (kilometrage) {
      await client.query(
        `UPDATE vehicles SET kilometrage = $1, updated_at = NOW() WHERE id = $2 AND kilometrage < $1`,
        [kilometrage, vehicle_id]
      );
    }

    await client.query('COMMIT');

    // Retourner la maintenance complète avec items
    const full = await pool.query(`
      SELECT m.*, v.marque, v.modele, v.immatriculation
      FROM maintenances m
      LEFT JOIN vehicles v ON m.vehicle_id = v.id
      WHERE m.id = $1
    `, [maintenance.id]);

    const fullItems = await pool.query(
      'SELECT * FROM maintenance_items WHERE maintenance_id = $1', [maintenance.id]
    );

    res.status(201).json({ ...full.rows[0], items: fullItems.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ message: err.message || 'Erreur serveur' });
  } finally {
    client.release();
  }
};

// PUT /api/maintenances/:id
const updateMaintenance = async (req, res) => {
  const {
    date_intervention, type_maintenance, description,
    kilometrage, fournisseur_nom, statut, notes
  } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM maintenances WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: 'Maintenance introuvable' });

    const m = existing.rows[0];
    const result = await pool.query(`
      UPDATE maintenances SET
        date_intervention = $1, type_maintenance = $2, description = $3,
        kilometrage = $4, fournisseur_nom = $5, statut = $6, notes = $7,
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [
      date_intervention || m.date_intervention,
      type_maintenance || m.type_maintenance,
      description !== undefined ? description : m.description,
      kilometrage || m.kilometrage,
      fournisseur_nom !== undefined ? fournisseur_nom : m.fournisseur_nom,
      statut || m.statut,
      notes !== undefined ? notes : m.notes,
      req.params.id
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/maintenances/:id/items  — ajouter un item à une maintenance existante
const addMaintenanceItem = async (req, res) => {
  const { piece_id, designation, quantite, prix_unitaire } = req.body;

  if (!designation || !quantite || !prix_unitaire)
    return res.status(400).json({ message: 'designation, quantite et prix_unitaire requis' });

  try {
    const exists = await pool.query('SELECT id FROM maintenances WHERE id = $1', [req.params.id]);
    if (exists.rows.length === 0)
      return res.status(404).json({ message: 'Maintenance introuvable' });

    const result = await pool.query(`
      INSERT INTO maintenance_items (maintenance_id, piece_id, designation, quantite, prix_unitaire)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [req.params.id, piece_id || null, designation, quantite, prix_unitaire]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/maintenances/:id/items/:itemId
const deleteMaintenanceItem = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM maintenance_items WHERE id = $1 AND maintenance_id = $2 RETURNING id',
      [req.params.itemId, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Item introuvable' });

    res.json({ message: 'Item supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getAllMaintenances,
  getMaintenanceById,
  createMaintenance,
  updateMaintenance,
  addMaintenanceItem,
  deleteMaintenanceItem
};
