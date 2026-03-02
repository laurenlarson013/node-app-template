// public/js/authGuard.js
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('jwtToken');
    if (!token) window.location.href = '/'; // logon page
  });