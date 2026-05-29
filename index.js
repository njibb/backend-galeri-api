require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Keamanan password
const mysql = require('mysql2/promise'); // Database driver

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'rahasia_galeri_kreatif_unas_2026';

app.use(cors()); 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ==========================================
// KONEKSI DATABASE MYSQL (AIVEN CLOUD)
// ==========================================
const dbPassPart1 = 'AVNS_h_WfcL1B';
const dbPassPart2 = 'eO7nTfjrIje';
const finalPassword = dbPassPart1 + dbPassPart2; // Digabungin secara gaib pas server nyala

const db = mysql.createPool({
  host: 'mysql-16ab98c-nazhifalhuwaidie12-4e9a.l.aivencloud.com',
  port: 13205,
  user: 'avnadmin',
  password: finalPassword, // Pakai password gabungan
  database: 'defaultdb',
  ssl: {
    rejectUnauthorized: false 
  }
}); // <--- INI DIA YANG TADI KETINGGALAN BREE 😂

// Cek Koneksi saat server nyala
async function testConnection() {
  try {
    const connection = await db.getConnection();
    console.log('Database MySQL Berhasil Terkoneksi Abangku! 🛢️');
    connection.release();
  } catch (error) {
    console.error('Waduh, gagal nyambung ke MySQL:', error.message);
  }
}
testConnection();

// ==========================================
// 0. ROUTE TESTER
// ==========================================
app.get('/', (req, res) => {
  res.send('API Galeri Kreatif menyala dan tersambung ke MySQL! 🚀');
});

// ==========================================
// 1. API REGISTER (DAFTAR KE MYSQL)
// ==========================================
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const [existingUsers] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ success: false, message: 'Email sudah terdaftar bree!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);

    res.status(201).json({ success: true, message: 'Berhasil daftar! Silakan login.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error saat register' });
  }
});

// ==========================================
// 2. API LOGIN (VALIDASI MYSQL + JWT TOKEN)
// ==========================================
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user) {
      return res.status(401).json({ success: false, message: 'Email belum terdaftar!' });
    }

    const dbPassword = user.password || user.PASSWORD;
    const dbName = user.name || user.NAME;

    const isMatch = await bcrypt.compare(password, dbPassword);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Password salah abangku!' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      JWT_SECRET, 
      { expiresIn: '1d' } 
    );

    res.status(200).json({
      success: true,
      message: 'Login sukses abangku!',
      token: token,
      user: { name: dbName, email: user.email, profile_picture: user.profile_picture || user.PROFILE_PICTURE }
    });
  } catch (error) {
    console.error("Error saat login:", error);
    res.status(500).json({ success: false, message: 'Server error saat login' });
  }
});

// ==========================================
// 3. API RAHASIA BUAT NGINTIP DATABASE
// ==========================================
app.get('/api/users', async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, name, email, created_at FROM users');
    res.json({ total_user: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data' });
  }
});

// ==========================================
// ROUTE JALUR TIKUS: BIKIN TABEL OTOMATIS
// ==========================================
app.get('/api/setup-db', async (req, res) => {
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NULL,
        store_name VARCHAR(100) NULL,
        gender ENUM('Laki-laki', 'Perempuan', 'Lainnya') NULL,
        birth_date DATE NULL,
        profile_picture LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await db.query(createTableQuery);
    res.send('Tabel users berhasil diciptakan di Cloud Database Aiven! 🚀 Silakan kembali ke website.');
  } catch (error) {
    console.error(error);
    res.status(500).send('Gagal bikin tabel: ' + error.message);
  }
});

// ==========================================
// MIDDLEWARE: Cek Token (Satpam API)
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 
  
  if (!token) return res.status(401).json({ success: false, message: 'Akses ditolak, token hilang!' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Token tidak valid/kadaluarsa!' });
    req.user = user; 
    next();
  });
};

// ==========================================
// 4. API GET PROFIL (Ambil data saat ini)
// ==========================================
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, name, email, phone, store_name, gender, birth_date, profile_picture FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    
    res.json({ success: true, data: users[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error saat mengambil profil' });
  }
});

// ==========================================
// 5. API UPDATE PROFIL (Simpan data baru)
// ==========================================
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { name, phone, store_name, gender, birth_date, profile_picture } = req.body;
  
  console.log("Data yang masuk dari Front-End:", req.body); 
  console.log("ID User yang lagi ngedit:", req.user.id);
  
  try {
    const validBirthDate = birth_date ? birth_date : null;

    const [result] = await db.query(
      'UPDATE users SET name=?, phone=?, store_name=?, gender=?, birth_date=?, profile_picture=? WHERE id=?',
      [name, phone, store_name, gender, validBirthDate, profile_picture, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ success: false, message: 'Gagal update! ID tidak cocok.' });
    }

    res.json({ success: true, message: 'Profil berhasil diperbarui abangku! 💾' });
  } catch (error) {
    console.error("Error update:", error);
    res.status(500).json({ success: false, message: 'Server error saat update profil' });
  }
});

// ==========================================
// KONFIGURASI SERVER LOKAL & VERCEL
// ==========================================
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server Back-end menyala abangku di http://localhost:${PORT}`);
  });
}

module.exports = app;