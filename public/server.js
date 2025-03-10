require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔹 Setup MySQL Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1020547676',
    database: 'habit_tracker'
});

db.connect(err => {
    if (err) throw err;
    console.log("✅ MySQL Connected...");
});

// 🔹 User Signup API
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword], 
    (err, result) => {
        if (err) return res.status(500).send("Error in signing up");
        res.status(201).send({ message: "User registered successfully!" });
    });
});

// 🔹 User Login API
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err || results.length === 0) return res.status(401).send("Invalid credentials");

        const isMatch = await bcrypt.compare(password, results[0].password);
        if (!isMatch) return res.status(401).send("Invalid credentials");

        const token = jwt.sign({ userId: results[0].id }, 'secretkey', { expiresIn: '1h' });
        res.json({ token, message: "Login successful!" });
    });
});

// ✅ Start Backend Server
app.listen(5000, () => console.log("🚀 Server running on port 5000"));
