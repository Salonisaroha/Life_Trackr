const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

// Hardcoded JWT secret key
const JWT_SECRET = "d47f2f763c9de2e48e8d7e68c65b7a3ad7f247108675a1b23e4e40c0f7a0a896b7dfc3f127de5a28a9b4dcdff0ceba5b3ed9b56cfed17212c47d4c53a4a23a58"; // <-- define it here

// User Registration
exports.register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // Check if email already exists
        User.findByEmail(email, async (err, results) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (results.length > 0) {
                return res.status(400).json({ message: "Email already registered" });
            }

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create new user
            User.create({ name, email, password: hashedPassword }, (err, result) => {
                if (err) return res.status(500).json({ message: "Database error during registration" });
                res.status(201).json({ message: "User registered successfully" });
            });
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// User Login
exports.login = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    User.findByEmail(email, async (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Generate token using the hardcoded secret
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1h" });

        res.json({ message: "Login successful", token });
    });
};
