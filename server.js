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
// Messaging API Routes 
//////////////////////////////////////
app.post('/api/conversations', authenticateToken, async (req, res) => {
    const { recipientEmail, listingId } = req.body;
    const userEmail = req.user.email;

    try {
        const connection = await createConnection();
        
        const [existing] = await connection.execute(
            `SELECT conversation_id FROM conversations 
             WHERE ((user_one_email = ? AND user_two_email = ?) 
             OR (user_one_email = ? AND user_two_email = ?))
             AND listing_id = ?`,
            [userEmail, recipientEmail, recipientEmail, userEmail, listingId]
        );

        if (existing.length > 0) {
            await connection.end();
            return res.status(200).json({ conversationId: existing[0].conversation_id });
        }

        const [result] = await connection.execute(
            `INSERT INTO conversations (user_one_email, user_two_email, listing_id) 
             VALUES (?, ?, ?)`,
            [userEmail, recipientEmail, listingId]
        );

        await connection.end();
        res.status(201).json({ conversationId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error starting conversation.' });
    }
});

app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT * FROM conversations 
             WHERE user_one_email = ? OR user_two_email = ?
             ORDER BY updated_at DESC`,
            [req.user.email, req.user.email]
        );

        await connection.end();
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching conversations.' });
    }
});

app.get('/api/conversations/:id/messages', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [authCheck] = await connection.execute(
            `SELECT 1 FROM conversations 
             WHERE conversation_id = ? AND (user_one_email = ? OR user_two_email = ?)`,
            [req.params.id, req.user.email, req.user.email]
        );

        if (authCheck.length === 0) {
            await connection.end();
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const [messages] = await connection.execute(
            'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
            [req.params.id]
        );

        await connection.end();
        res.status(200).json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching messages.' });
    }
});

app.post('/api/conversations/:id/messages', authenticateToken, async (req, res) => {
    const { messageText } = req.body;

    try {
        const connection = await createConnection();

        await connection.execute(
            `INSERT INTO messages (conversation_id, sender_email, message_text, is_read) 
             VALUES (?, ?, ?, 0)`,
            [req.params.id, req.user.email, messageText]
        );

        await connection.execute(
            'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?',
            [req.params.id]
        );

        await connection.end();
        res.status(201).json({ message: 'Message sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error sending message.' });
    }
});

app.put('/api/messages/:id/read', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        await connection.execute(
            'UPDATE messages SET is_read = 1 WHERE message_id = ?',
            [req.params.id]
        );
        await connection.end();
        res.status(200).json({ message: 'Success' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error' });
    }
});

// 1. Create a new trade offer
app.post('/api/trade-offers', authenticateToken, async (req, res) => {
    const { conversation_id, requested_listing_id, offered_listing_id, message_text } = req.body;
    const userEmail = req.user.email;

    try {
        const connection = await createConnection();

        // Verifies that the offered listing belongs to current user
        const [offeredRows] = await connection.execute(
            'SELECT user_email, status FROM listings WHERE listing_id = ?',
            [offered_listing_id]
        );

        if (offeredRows.length === 0 || offeredRows[0].user_email !== userEmail) {
            await connection.end();
            return res.status(403).json({ message: "You don't own the offered item." });
        }

        // Verifies that the requested listing belongs to someone else
        const [requestedRows] = await connection.execute(
            'SELECT user_email, status FROM listings WHERE listing_id = ?',
            [requested_listing_id]
        );

        if (requestedRows.length === 0 || requestedRows[0].user_email === userEmail) {
            await connection.end();
            return res.status(400).json({ message: "Invalid requested listing." });
        }

        // Verifies that both listings are still active
        if (offeredRows[0].status !== 'Active' || requestedRows[0].status !== 'Active') {
            await connection.end();
            return res.status(400).json({ message: "One or both listings are no longer active." });
        }

        // Prevent duplicate pending offers
        const [duplicates] = await connection.execute(
            'SELECT trade_offer_id FROM trade_offers WHERE offered_listing_id = ? AND requested_listing_id = ? AND status = "Pending"',
            [offered_listing_id, requested_listing_id]
        );
        if (duplicates.length > 0) {
            await connection.end();
            return res.status(409).json({ message: "A pending offer already exists for these items." });
        }

        // Insert trade offer
        const [result] = await connection.execute(
            `INSERT INTO trade_offers 
            (conversation_id, offered_by_email, requested_listing_id, offered_listing_id, status, message_text) 
            VALUES (?, ?, ?, ?, 'Pending', ?)`,
            [conversation_id, userEmail, requested_listing_id, offered_listing_id, message_text]
        );

        await connection.end();
        res.status(201).json({ message: 'Trade offer sent!', trade_offer_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error with creating this trade offer.' });
    }
});

// 2. Fetch all trade offers for a specific conversation
app.get('/api/conversations/:id/trade-offers', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [authCheck] = await connection.execute(
            'SELECT 1 FROM conversations WHERE conversation_id = ? AND (user_one_email = ? OR user_two_email = ?)',
            [req.params.id, req.user.email, req.user.email]
        );

        if (authCheck.length === 0) {
            await connection.end();
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const [offers] = await connection.execute(
            'SELECT * FROM trade_offers WHERE conversation_id = ? ORDER BY created_at DESC',
            [req.params.id]
        );

        await connection.end();
        res.status(200).json(offers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching trade offers.' });
    }
});

// 3. Respond to a trade offer (Accept or Decline)
app.put('/api/trade-offers/:id/respond', authenticateToken, async (req, res) => {
    const { status } = req.body; 
    const userEmail = req.user.email;

    if (!['Accepted', 'Declined'].includes(status)) {
        return res.status(400).json({ message: "Status must be 'Accepted' or 'Declined'." });
    }

    try {
        const connection = await createConnection();

        // Verify that the user is the one who receive the offer
        const [offer] = await connection.execute(
            `SELECT t.*, l.user_email as owner_email 
             FROM trade_offers t
             JOIN listings l ON t.requested_listing_id = l.listing_id
             WHERE t.trade_offer_id = ?`,
            [req.params.id]
        );

        if (offer.length === 0 || offer[0].owner_email !== userEmail) {
            await connection.end();
            return res.status(403).json({ message: "You are not authorized to respond to this offer." });
        }

        await connection.execute(
            'UPDATE trade_offers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE trade_offer_id = ?',
            [status, req.params.id]
        );

        // If accepted, optionally mark listings as "Traded" (discuss with Person 1)
        if (status === 'Accepted') {
            await connection.execute(
                'UPDATE listings SET status = "Sold" WHERE listing_id IN (?, ?)',
                [offer[0].requested_listing_id, offer[0].offered_listing_id]
            );
        }

        await connection.end();
        res.status(200).json({ message: `Trade offer ${status.toLowerCase()}.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error responding to trade offer.' });
    }
});

// 4. Cancel a pending trade offer
app.put('/api/trade-offers/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [result] = await connection.execute(
            'UPDATE trade_offers SET status = "Cancelled", updated_at = CURRENT_TIMESTAMP WHERE trade_offer_id = ? AND offered_by_email = ? AND status = "Pending"',
            [req.params.id, req.user.email]
        );

        await connection.end();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Offer not found, already processed, or unauthorized." });
        }

        res.status(200).json({ message: 'Trade offer cancelled.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error cancelling trade offer.' });
    }
});

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
    let { full_name, email, password } = req.body;
  
    if (!full_name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }
  
    full_name = full_name.trim();
    email = email.trim().toLowerCase();
  
    if (!email.endsWith('.edu')) {
      return res.status(403).json({ message: 'Only students with a valid .edu email address can sign up.' });
    }
  
    try {
      const connection = await createConnection();
      const hashedPassword = await bcrypt.hash(password, 10);
  
      await connection.execute(
        'INSERT INTO user (email, full_name, password, is_verified) VALUES (?, ?, ?, ?)',
        [email, full_name, hashedPassword, 1]
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
        [email.trim().toLowerCase()]
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
  
      res.status(200).json({
        token,
        full_name: user.full_name
      });
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
                u.email AS seller_email,
                u.full_name AS seller_name,
                u.profile_photo_url AS seller_photo,
                u.campus AS seller_university
            FROM listings l
            JOIN user u ON l.user_email = u.email
            WHERE l.status = 'Active'
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