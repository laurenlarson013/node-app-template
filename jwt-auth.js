const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

// Secret Key
const JWT_SECRET = "backendbandits"; 

// 1. Validation Token Middleware
const validateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    // Looks for "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Error: No Token Found. Access Denied." });
    }

    try {
        // Validation
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified; 
        next(); 
    } catch (err) {
        res.status(403).json({ message: "Invalid or Expired Token." });
    }
};

// 2. Protected Route for JWT
// Go here after running node: http://localhost:3000/api/admin/users
app.get('/api/admin/users', validateToken, (req, res) => {
    res.json({
        success: true,
        message: "JWT Validated! Data retrieved from mock database.",
        team: [
            { id: 1, name: "Radhika", role: "Scrum Master" },
            { id: 2, name: "Shriya", role: "Product Owner" },
            { id: 3, name: "Huda", role: "Developer" },
            { id: 4, name: "An", role: "Developer" },
            { id: 5, name: "Dina", role: "Developer" },
            { id: 6, name: "Lauren", role: "Developer" }
        ]
    });
});

app.listen(3000, () => console.log("Backend Server running at: http://localhost:3000"));

// Generate test token on Safari
console.log("TEST_TOKEN:", jwt.sign({ name: "An" }, JWT_SECRET));

/* Testing JS Console log, do not mistaken for query:

fetch('http://localhost:3000/api/admin/users', {
    method: 'GET',
    headers: { 
        'Authorization': 'Bearer token' 
    }
})
.then(res => res.json())
.then(data => {
    console.log("ID", "NAME", "ROLE");
    console.table(data.team, ["id", "name", "role"]); 
})
.catch(err => console.error("Error: Access Denied", err));

*/