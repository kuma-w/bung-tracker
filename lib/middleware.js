function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  }
  next();
}

module.exports = { requireAdmin };
