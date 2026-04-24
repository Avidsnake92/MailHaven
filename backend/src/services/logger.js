const log = async (db, userId, action, details = {}, ipAddress = null) => {
  try {
    await db.query(
      'INSERT INTO activity_log (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [userId || null, action, JSON.stringify(details), ipAddress]
    );
  } catch (err) {
    console.error('Log error:', err.message);
  }
};

module.exports = { log };
