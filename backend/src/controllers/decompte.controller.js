const pool = require('../config/db');

// Génère une référence unique style DEC-2024-0023
const generateReference = async (client) => {
  const year = new Date().getFullYear();
  const result = await client.query(
    `SELECT COUNT(*) FROM decomptes WHERE EXTRACT(YEAR FROM created_at) = $1`, [year]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `DEC-${year}-${String(count).padStart(4, '0')}`;
};

// GET /api/decomptes
const getAllDecomptes = async (req, res) => {
  const { statut, fournisseur_id, from, to } = req.query;

  // Un fournisseur ne voit que ses propres décomptes
  const isTransport = ['transport', 'consultant'].includes(req.user.role);

  let query = `
    SELECT
      d.*,
      u.nom AS fournisseur_nom, u.prenom AS fournisseur_prenom,
      uv.nom AS valideur_nom, uv.prenom AS valideur_prenom,
      (SELECT COUNT(*) FROM decompte_items WHERE decompte_id = d.id) AS nb_lignes
    FROM decomptes d
    LEFT JOIN users u ON d.fournisseur_id = u.id
    LEFT JOIN users uv ON d.valide_par = uv.id
    WHERE 1=1
  `;
  const params = [];
  let i = 1;

  if (!isTransport) {
    query += ` AND d.fournisseur_id = $${i++}`;
    params.push(req.user.id);
  } else if (fournisseur_id) {
    query += ` AND d.fournisseur_id = $${i++}`;
    params.push(fournisseur_id);
  }

  if (statut) { query += ` AND d.statut = $${i++}`; params.push(statut); }
  if (from) { query += ` AND d.date_soumission >= $${i++}`; params.push(from); }
  if (to) { query += ` AND d.date_soumission <= $${i++}`; params.push(to); }

  query += ` ORDER BY d.date_soumission DESC`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/decomptes/:id  — avec tous les items
const getDecompteById = async (req, res) => {
  try {
    const decompte = await pool.query(`
      SELECT
        d.*,
        u.nom AS fournisseur_nom, u.prenom AS fournisseur_prenom,
        uv.nom AS valideur_nom, uv.prenom AS valideur_prenom
      FROM decomptes d
      LEFT JOIN users u ON d.fournisseur_id = u.id
      LEFT JOIN users uv ON d.valide_par = uv.id
      WHERE d.id = $1
    `, [req.params.id]);

    if (decompte.rows.length === 0)
      return res.status(404).json({ message: 'Décompte introuvable' });

    // Un fournisseur ne peut voir que ses propres décomptes
    if (req.user.role === 'fournisseur' && decompte.rows[0].fournisseur_id !== req.user.id)
      return res.status(403).json({ message: 'Accès refusé' });

    const items = await pool.query(`
      SELECT
        di.*,
        v.marque, v.modele, v.immatriculation,
        pc.prix_contrat AS prix_catalogue
      FROM decompte_items di
      LEFT JOIN vehicles v ON di.vehicle_id = v.id
      LEFT JOIN pieces_catalogue pc ON di.piece_id = pc.id
      WHERE di.decompte_id = $1
      ORDER BY di.created_at ASC
    `, [req.params.id]);

    res.json({ ...decompte.rows[0], items: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/decomptes  — soumission par le fournisseur
const createDecompte = async (req, res) => {
  const { notes, items = [] } = req.body;

  if (items.length === 0)
    return res.status(400).json({ message: 'Le décompte doit contenir au moins un item' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reference = await generateReference(client);

    // Calculer les totaux
    const montantHT = items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantite) * parseFloat(item.prix_unitaire));
    }, 0);
    const tauxTVA = 20;
    const montantTVA = montantHT * (tauxTVA / 100);
    const montantTTC = montantHT + montantTVA;

    const dResult = await client.query(`
      INSERT INTO decomptes
        (fournisseur_id, reference, montant_ht, taux_tva, montant_tva, montant_ttc, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [req.user.id, reference, montantHT, tauxTVA, montantTVA, montantTTC, notes || null]);

    const decompte = dResult.rows[0];

    // Insérer les items avec récupération du prix catalogue pour comparaison
    for (const item of items) {
      if (!item.designation || !item.quantite || !item.prix_unitaire || !item.vehicle_id)
        throw new Error('Chaque item doit avoir vehicle_id, designation, quantite, prix_unitaire');

      // Récupérer le prix du contrat si la pièce est dans le catalogue
      let prixContrat = null;
      if (item.piece_id) {
        const pc = await client.query(
          'SELECT prix_contrat FROM pieces_catalogue WHERE id = $1', [item.piece_id]
        );
        if (pc.rows.length > 0) prixContrat = pc.rows[0].prix_contrat;
      }

      await client.query(`
        INSERT INTO decompte_items
          (decompte_id, vehicle_id, piece_id, designation, quantite, prix_unitaire, prix_contrat)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        decompte.id, item.vehicle_id, item.piece_id || null,
        item.designation, item.quantite, item.prix_unitaire, prixContrat
      ]);
    }

    await client.query('COMMIT');
    res.status(201).json({ ...decompte, message: 'Décompte soumis avec succès' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ message: err.message || 'Erreur serveur' });
  } finally {
    client.release();
  }
};

// PUT /api/decomptes/:id/validate  — transport only
const validateDecompte = async (req, res) => {
  const { notes } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM decomptes WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: 'Décompte introuvable' });

    if (existing.rows[0].statut !== 'en_attente')
      return res.status(400).json({ message: `Impossible de valider un décompte en statut : ${existing.rows[0].statut}` });

    const result = await pool.query(`
      UPDATE decomptes SET
        statut = 'valide',
        valide_par = $1,
        date_validation = NOW(),
        notes = COALESCE($2, notes)
      WHERE id = $3 RETURNING *
    `, [req.user.id, notes || null, req.params.id]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/decomptes/:id/reject  — transport only
const rejectDecompte = async (req, res) => {
  const { motif_rejet } = req.body;

  if (!motif_rejet)
    return res.status(400).json({ message: 'Le motif de rejet est obligatoire' });

  try {
    const existing = await pool.query('SELECT * FROM decomptes WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: 'Décompte introuvable' });

    if (!['en_attente', 'en_revision'].includes(existing.rows[0].statut))
      return res.status(400).json({ message: `Impossible de rejeter un décompte en statut : ${existing.rows[0].statut}` });

    const result = await pool.query(`
      UPDATE decomptes SET
        statut = 'rejete',
        valide_par = $1,
        date_validation = NOW(),
        motif_rejet = $2
      WHERE id = $3 RETURNING *
    `, [req.user.id, motif_rejet, req.params.id]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/decomptes/:id/revision  — demander une correction au fournisseur
const requestRevision = async (req, res) => {
  const { motif_rejet } = req.body;

  if (!motif_rejet)
    return res.status(400).json({ message: 'Le motif de révision est obligatoire' });

  try {
    const result = await pool.query(`
      UPDATE decomptes SET statut = 'en_revision', motif_rejet = $1
      WHERE id = $2 AND statut = 'en_attente'
      RETURNING *
    `, [motif_rejet, req.params.id]);

    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Décompte introuvable ou déjà traité' });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getAllDecomptes,
  getDecompteById,
  createDecompte,
  validateDecompte,
  rejectDecompte,
  requestRevision
};
