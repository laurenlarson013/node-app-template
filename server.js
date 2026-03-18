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
//ROUTES TO SERVE HTML FILES
//////////////////////////////////////
// Route to serve browse.html
app.get('/browse', (req, res) => {
    res.sendFile(__dirname + '/public/js/browse.html');
});

// Route to serve profile.html
app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/js/profile.html');
});

// Route to serve listing-new.html
app.get('/listing-new', (req, res) => {
    res.sendFile(__dirname + '/public/js/listing-new.html');
});

// Route to serve my-listings.html
app.get('/my-listings', (req, res) => {
    res.sendFile(__dirname + '/public/js/my-listings.html');
});

// Route to serve messages.html
app.get('/messages', (req, res) => {
    res.sendFile(__dirname + '/public/js/messages.html');
});
//////////////////////////////////////
//END ROUTES TO SERVE HTML FILES
//////////////////////////////////////


/////////////////////////////////////////////////
//HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////
// Helper function to create a MySQL connection
async function createConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

// **Authorization Middleware: Verify JWT Token and Check User in Database**
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

            // Query the database to verify that the email is associated with an active account
            const [rows] = await connection.execute(
                'SELECT email FROM user WHERE email = ?',
                [decoded.email]
            );

            await connection.end();  // Close connection

            if (rows.length === 0) {
                return res.status(403).json({ message: 'Account not found or deactivated.' });
            }

            req.user = decoded;  // Save the decoded email for use in the route
            next();  // Proceed to the next middleware or route handler
        } catch (dbError) {
            console.error(dbError);
            res.status(500).json({ message: 'Database error during authentication.' });
        }
    });
}
/////////////////////////////////////////////////
//END HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////


//////////////////////////////////////
//ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////

// Route: Create Account (Updated for Task 2)
app.post('/api/create-account', async (req, res) => {
    let { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    // 1. Trim and lowercase email
    email = email.trim().toLowerCase();

    // 2. Reject if email does not end with .edu
    if (!email.endsWith('.edu')) {
        return res.status(403).json({ 
            message: 'Only students with a valid .edu email address can sign up.' 
        });
    }

    try {
        const connection = await createConnection();
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Insert user with is_verified = 1
        const [result] = await connection.execute(
            'INSERT INTO user (email, password, is_verified) VALUES (?, ?, ?)',
            [email, hashedPassword, 1] // Verified by default for .edu
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

// Route: Logon
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

        await connection.end();  // Close connection

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

// Route: Get Profile 
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        // Query using exact column names from your database screenshot
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

// Task 4 — Backend: Update Profile
app.put('/api/me', authenticateToken, async (req, res) => {
    const { full_name, bio, campus, location, profile_photo_url } = req.body;

    try {
        const connection = await createConnection();

        // Update the user table using the email from the JWT (req.user.email)
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

// Route: Get All Email Addresses
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute('SELECT email FROM user');

        await connection.end();  // Close connection

        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving email addresses.' });
    }
});
//////////////////////////////////////
//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////

// Create Listing API
app.post('/api/listings', authenticateToken, async (req, res) => {
    // Get the data from the request body
    const { title, description, price, university, category } = req.body;

    // Ensure no empty fields are left 
    if (!title || !price || !university) {
        return res.status(400).json({ message: 'Title, Price, and University are required.' });
    }

    try {
        const connection = await createConnection();

        // Insert listing into the database, using req.user.email from JWT to link the user’s email to the posting. 
        const [result] = await connection.execute(
            'Insert INTO listings (title, description, price, university, category, user_email) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, price, university, category, req.user.email]
        );

        await connection.end();

        // Return success response back to the frontend
        res.status(201).json({ 
            message: 'Listing successfully created!',
            listingId: result.insertId 
        });

    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ message: 'Cannot create listing. Please try again.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
