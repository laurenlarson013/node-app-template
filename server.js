require('dotenv').config();

console.log("DB_HOST =", process.env.DB_HOST);
console.log("DB_NAME =", process.env.DB_NAME);

const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static('public'));

//////////////////////////////////////
// ROUTES TO SERVE HTML FILES
//////////////////////////////////////

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/logon.html');
});

app.get('/browse', (req, res) => {
    res.sendFile(__dirname + '/public/browse.html');
});

app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});

app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/profile.html');
});

app.get('/listing-new', (req, res) => {
    res.sendFile(__dirname + '/public/listing-new.html');
});

app.get('/my-listings', (req, res) => {
    res.sendFile(__dirname + '/public/my-listings.html');
});

app.get('/messages', (req, res) => {
    res.sendFile(__dirname + '/public/messages.html');
});

//////////////////////////////////////
// HELPER FUNCTIONS AND AUTH MIDDLEWARE
//////////////////////////////////////

async function createConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

async function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token.' });
        }

        try {
            const connection = await createConnection();

            const [rows] = await connection.execute(
                'SELECT email FROM user WHERE email = ?',
                [decoded.email]
            );

            await connection.end();

            if (rows.length === 0) {
                return res.status(403).json({ message: 'Account not found or deactivated.' });
            }

            req.user = decoded;
            next();
        } catch (dbError) {
            console.error(dbError);
            res.status(500).json({ message: 'Database error during authentication.' });
        }
    });
}

//////////////////////////////////////
// API ROUTES
//////////////////////////////////////

// Create Listing
app.post('/api/listings', authenticateToken, async (req, res) => {
    const {
        title,
        description,
        price,
        photos,
        university,
        category,
        trade_option,
        item_condition,
        pickup_details
    } = req.body;

    try {
        const connection = await createConnection();

        const [result] = await connection.execute(
            `INSERT INTO listings
            (listing_id, user_email, title, price, trade_option, item_condition, pickup_details, listing_description, photos, created_at, updated_at, university, category, status)
            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)`,
            [
                req.user.email,
                title,
                price,
                trade_option || 'None',
                item_condition || 'Good',
                pickup_details || 'MU',
                description,
                photos || '',
                university,
                category,
                'Active'
            ]
        );

        await connection.end();
        res.status(201).json({
            message: 'Listing created successfully!',
            listingId: result.insertId
        });
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// Create Account
app.post('/api/create-account', async (req, res) => {
    let { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    email = email.trim().toLowerCase();

    if (!email.endsWith('.edu')) {
        return res.status(403).json({
            message: 'Only students with a valid .edu email address can sign up.'
        });
    }

    try {
        const connection = await createConnection();
        const hashedPassword = await bcrypt.hash(password, 10);

        await connection.execute(
            'INSERT INTO user (email, password, is_verified) VALUES (?, ?, ?)',
            [email, hashedPassword, 1]
        );

        await connection.end();
        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'An account with this email already exists.' });
        } else {
            console.error(error);
            res.status(500).json({ message: 'Error creating account.' });
        }
    }
});

// My Listings
app.get('/api/my-listings', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute(
            'SELECT * FROM listings WHERE user_email = ? ORDER BY created_at DESC',
            [req.user.email]
        );

        await connection.end();
        res.status(200).json(rows);
    } catch (error) {
        console.error("Database Error in listings:", error);
        res.status(500).json({ message: 'Cannot retrieve your listings.' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const connection = await createConnection();

        const [rows] = await connection.execute(
            'SELECT * FROM user WHERE email = ?',
            [email]
        );

        await connection.end();

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const user = rows[0];

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error logging in.' });
    }
});

// Get Profile
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute(
            'SELECT email, full_name, bio, campus, location, profile_photo_url, is_verified FROM user WHERE email = ?',
            [req.user.email]
        );

        await connection.end();

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving profile data.' });
    }
});

// Update Profile
app.put('/api/me', authenticateToken, async (req, res) => {
    const { full_name, bio, campus, location, profile_photo_url } = req.body;

    try {
        const connection = await createConnection();

        const [result] = await connection.execute(
            `UPDATE user
             SET full_name = ?, bio = ?, campus = ?, location = ?, profile_photo_url = ?
             WHERE email = ?`,
            [full_name, bio, campus, location, profile_photo_url, req.user.email]
        );

        await connection.end();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json({ message: 'Profile Updated!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error Encountered.' });
    }
});

// Get All Email Addresses
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute('SELECT email FROM user');

        await connection.end();

        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving email addresses.' });
    }
});

// Browse Listings
app.get('/api/listings', async (req, res) => {
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute(`
            SELECT
                l.listing_id,
                l.title,
                l.listing_description AS description,
                l.price,
                l.photos,
                l.university,
                l.category,
                l.trade_option,
                l.item_condition,
                l.pickup_details,
                l.created_at,
                l.status,
                u.full_name AS seller_name,
                u.profile_photo_url AS seller_photo,
                u.campus AS seller_university
            FROM listings l
            JOIN user u ON l.user_email = u.email
            ORDER BY l.created_at DESC
        `);

        await connection.end();
        res.json(rows);
    } catch (err) {
        console.error("Error fetching listings:", err);
        res.status(500).json({ message: "Server error fetching listings" });
    }
});

// Edit Listing
app.put('/api/listings/:id', authenticateToken, async (req, res) => {
    const {
        title,
        description,
        price,
        university,
        category,
        trade_option,
        item_condition,
        pickup_details,
        photos
    } = req.body;

    try {
        const connection = await createConnection();

        const [result] = await connection.execute(
            `UPDATE listings
             SET title = ?,
                 listing_description = ?,
                 price = ?,
                 university = ?,
                 category = ?,
                 trade_option = ?,
                 item_condition = ?,
                 pickup_details = ?,
                 photos = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE listing_id = ? AND user_email = ?`,
            [
                title,
                description,
                price,
                university,
                category,
                trade_option,
                item_condition,
                pickup_details,
                photos || '',
                req.params.id,
                req.user.email
            ]
        );

        await connection.end();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }

        res.status(200).json({ message: 'Listing updated successfully.' });
    } catch (error) {
        console.error("Edit listing error:", error);
        res.status(500).json({ message: 'Error updating listing.' });
    }
});

// Mark Listing as Sold
app.put('/api/listings/:id/mark-sold', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [result] = await connection.execute(
            `UPDATE listings
             SET status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE listing_id = ? AND user_email = ?`,
            ['Sold', req.params.id, req.user.email]
        );

        await connection.end();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }

        res.status(200).json({ message: 'Listing marked as sold.' });
    } catch (error) {
        console.error("Mark sold error:", error);
        res.status(500).json({ message: 'Error marking listing sold.' });
    }
});

// Delete Listing
app.delete('/api/listings/:id', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [result] = await connection.execute(
            `DELETE FROM listings
             WHERE listing_id = ? AND user_email = ?`,
            [req.params.id, req.user.email]
        );

        await connection.end();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }

        res.status(200).json({ message: 'Listing deleted successfully.' });
    } catch (error) {
        console.error("Delete listing error:", error);
        res.status(500).json({ message: 'Error deleting listing.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});