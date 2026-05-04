const pool = require('../config/db');

// GET /api/dashboard/stats
const getDashboardStats = async (req, res) => {
  try {
    // Stats véhicules
    const vehicleStats = await pool.query(`
      SELECT
        COUNT(*)                                        AS total,
        COUNT(*) FILTER (WHERE etat = 'bon_etat')      AS bon_etat,
        COUNT(*) FILTER (WHERE etat = 'en_panne')       AS en_panne,
        COUNT(*) FILTER (WHERE etat = 'en_maintenance') AS en_maintenance,
        COUNT(*) FILTER (WHERE etat = 'a_reformer')     AS a_reformer
      FROM vehicles
    `);

    // Stats décomptes
    const decompteStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE statut = 'en_attente') AS en_attente,
        COUNT(*) FILTER (WHERE statut = 'valide')     AS valides,
        COUNT(*) FILTER (WHERE statut = 'rejete')     AS rejetes,
        COALESCE(SUM(montant_ttc) FILTER (WHERE statut = 'valide'), 0) AS total_valide_ttc
      FROM decomptes
    `);

    // Coût total maintenances (30 derniers jours)
    const maintenanceCost = await pool.query(`
      SELECT
        COALESCE(SUM(mi.total_ht), 0) AS cout_30j
      FROM maintenance_items mi
      JOIN maintenances m ON mi.maintenance_id = m.id
      WHERE m.date_intervention >= NOW() - INTERVAL '30 days'
    `);

    // Top 5 véhicules les plus coûteux
    const topVehicles = await pool.query(`
      SELECT
        v.marque, v.modele, v.immatriculation,
        COALESCE(SUM(mi.total_ht), 0) AS cout_total
      FROM vehicles v
      LEFT JOIN maintenances m ON m.vehicle_id = v.id
      LEFT JOIN maintenance_items mi ON mi.maintenance_id = m.id
      GROUP BY v.id, v.marque, v.modele, v.immatriculation
      ORDER BY cout_total DESC
      LIMIT 5
    `);

    // Coûts par mois (12 derniers mois)
    const coutParMois = await pool.query(`
      SELECT
        TO_CHAR(m.date_intervention, 'YYYY-MM') AS mois,
        COALESCE(SUM(mi.total_ht), 0)           AS cout_ht
      FROM maintenances m
      LEFT JOIN maintenance_items mi ON mi.maintenance_id = m.id
      WHERE m.date_intervention >= NOW() - INTERVAL '12 months'
      GROUP BY mois
      ORDER BY mois ASC
    `);

    // Répartition par type de maintenance
    const repartitionTypes = await pool.query(`
      SELECT type_maintenance, COUNT(*) AS nb
      FROM maintenances
      GROUP BY type_maintenance
    `);

    res.json({
      vehicules: vehicleStats.rows[0],
      decomptes: decompteStats.rows[0],
      cout_30_jours: maintenanceCost.rows[0].cout_30j,
      top_vehicules_couteux: topVehicles.rows,
      couts_par_mois: coutParMois.rows,
      repartition_types: repartitionTypes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getDashboardStats };
