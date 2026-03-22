// auth.js
// Handles login, registration, JWT storage, and redirects

const BASE_URL = "http://localhost:3000"; // Backend server
const TOKEN_KEY = "jwt_token";             // Where we store the JWT

/* --------------------------------------------------
   If the user is already logged in, don't show login
-------------------------------------------------- */
if (
  localStorage.getItem(TOKEN_KEY) &&
  window.location.pathname.includes("login")
) {
  window.location.href = "dashboard.html";
}

/* --------------------------------------------------
   LOGIN LOGIC
-------------------------------------------------- */
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); // Stop normal form submission

    // Grab user input
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const errorMessage = document.getElementById("error");

    errorMessage.textContent = ""; // Clear old errors

    try {
      // Send login request to backend
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      // If login fails, show message
      if (!response.ok) {
        errorMessage.textContent =
          data.message || "Invalid email or password.";
        return;
      }

      // Save JWT so the user stays logged in
      localStorage.setItem(TOKEN_KEY, data.token);

      // Send user to protected page
      window.location.href = "dashboard.html";

    } catch (error) {
      errorMessage.textContent =
        "Could not connect to the server. Please try again.";
    }
  });
}

/* --------------------------------------------------
   REGISTRATION LOGIC
-------------------------------------------------- */
const registerForm = document.getElementById("registerForm");

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Grab user input
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const message = document.getElementById("message");

    message.textContent = "";
    message.style.color = "red";

    try {
      // Send registration request
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      // If registration fails, show message
      if (!response.ok) {
        message.textContent =
          data.message || "Registration failed.";
        return;
      }

      // Success feedback
      message.style.color = "green";
      message.textContent =
        "Account created successfully. Redirecting to login...";

      // Give user a second to read message, then redirect
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1500);

    } catch (error) {
      message.textContent =
        "Could not connect to the server. Please try again.";
    }
  });
}