// guard.js

const TOKEN_KEY = "jwt_token";

// ⚠️ DEV ONLY — hardcoded test token from backend screenshot
const TEST_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiQW4iLCJpYXQiOjE3NzIyMjU4MDB9._-vBIqamzzoffy1sVJsUWJFnS27eiVZInoLSZEZnv3Q";

// Auto-set token if it does not exist (Sprint 1 testing)
if (!localStorage.getItem(TOKEN_KEY)) {
  localStorage.setItem(TOKEN_KEY, TEST_TOKEN);
}

// Get token
const token = localStorage.getItem(TOKEN_KEY);

// Redirect if not authenticated
if (!token) {
  window.location.href = "login.html";
}

// Logout logic
const logoutBtn = document.getElementById("logout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "login.html";
  });
}